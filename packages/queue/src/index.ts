import { tracing } from "cloudflare:workers";
import { createDb, mods, packImages, packs, transitionPack, users } from "@vgskins/db";
import { logger } from "@vgskins/logger";
import {
  QUEUE_CORRELATION_ATTRIBUTE,
  QueueMessage,
  type OptimizeImagesMessage,
  type ProcessDatFileMessage,
} from "@vgskins/shared/queue";
import { and, asc, eq, isNull, or } from "drizzle-orm";
import { validateDat } from "./dat-validator";
import { handleDeadLetterBatch } from "./dead-letter";
import { sendModeratorNotifications } from "./email";
import { sweepAbandonedCorruptedPacks, sweepStaleProcessingPacks } from "./stale-sweep";
import type { Env } from "./types";

// Keep aligned with max_retries for every environment in packages/queue/wrangler.toml.
const MAX_PROCESSING_RETRIES = 5;

export default {
  async queue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
    // Dead-letter batches exhausted their retries on the main queue and are
    // reported instead of left unread. See packages/queue/src/dead-letter.ts.
    if (batch.queue.endsWith("-dlq")) {
      await handleDeadLetterBatch(batch, env.DISCORD_WEBHOOK_ALERTS);
      return;
    }
    for (const message of batch.messages) {
      const parsed = QueueMessage.safeParse(message.body);
      if (!parsed.success) {
        logger.error(
          { messageId: message.id, issues: parsed.error.issues },
          "Discarding invalid queue message"
        );
        message.ack();
        continue;
      }
      const body = parsed.data;

      await tracing.enterSpan("processing_queue.process", async (span) => {
        if (body.correlationId) {
          span.setAttribute(QUEUE_CORRELATION_ATTRIBUTE, body.correlationId);
        }
        span.setAttribute("messaging.system", "cloudflare_queues");
        span.setAttribute("messaging.operation.type", "process");
        span.setAttribute("messaging.message.id", message.id);
        span.setAttribute("vgskins.queue.message_type", body.type);
        span.setAttribute("vgskins.queue.attempt", message.attempts);

        try {
          if (body.type === "process_dat") {
            await processDatFile(body, env);
          } else if (body.type === "optimize_images") {
            await optimizeImages(body, env);
          }
          message.ack();
          span.setAttribute("vgskins.queue.result", "ack");
          logger.info(
            {
              correlationId: body.correlationId,
              messageId: message.id,
              messageType: body.type,
              attempts: message.attempts,
            },
            "Queue message processed"
          );
        } catch (error) {
          const attempts = message.attempts;
          const exhausted = attempts > MAX_PROCESSING_RETRIES;
          span.setAttribute("vgskins.queue.result", exhausted ? "exhausted" : "retry");
          span.setAttribute("error.type", error instanceof Error ? error.name : "unknown");
          logger.error(
            {
              error,
              attempts,
              exhausted,
              correlationId: body.correlationId,
              messageId: message.id,
              message: body,
            },
            "Queue processing error"
          );
          if (exhausted) {
            await recordExhaustedFailure(body, error, env, attempts);
          }
          message.retry();
        }
      });
    }
  },
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    const db = createDb(env.DB);
    const now = new Date();
    await sweepStaleProcessingPacks(db, now);
    await sweepAbandonedCorruptedPacks(db, env.BUCKET, now);
  },
} satisfies ExportedHandler<Env, QueueMessage>;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function failModPermanently(
  db: ReturnType<typeof createDb>,
  modId: string,
  packId: string,
  reason: string
) {
  const now = new Date();
  await db
    .update(mods)
    .set({
      processingStatus: "failed",
      processingError: reason,
      processedAt: now,
    })
    .where(eq(mods.id, modId));
  await refreshPackProcessingStatus(db, packId);
}

/**
 * Jobs run only for a pack that is waiting on them: one processing, or one the
 * stale sweep marked corrupted while its jobs were late. A duplicate or stray
 * message for any other pack changes nothing.
 */
async function packAwaitsJobs(db: ReturnType<typeof createDb>, packId: string) {
  const pack = await db.query.packs.findFirst({
    where: and(eq(packs.id, packId), isNull(packs.deletedAt)),
    columns: { status: true },
  });
  return pack?.status === "processing" || pack?.status === "corrupted";
}

async function processDatFile(message: ProcessDatFileMessage, env: Env) {
  const { modId, packId } = message;
  const db = createDb(env.DB);
  if (!(await packAwaitsJobs(db, packId))) {
    logger.warn({ modId, packId }, "Skipping DAT validation for a pack not awaiting it");
    return;
  }
  const mod = await db.query.mods.findFirst({
    where: and(eq(mods.id, modId), eq(mods.packId, packId)),
    columns: { id: true, fileKey: true },
  });
  if (!mod) {
    logger.warn({ modId, packId }, "Skipping processing for a removed mod");
    return;
  }

  await db
    .update(mods)
    .set({
      processingStatus: "processing",
      processingError: null,
    })
    .where(eq(mods.id, modId));

  const file = await env.BUCKET.get(mod.fileKey);
  if (!file) {
    await failModPermanently(db, modId, packId, "Uploaded file is missing from storage");
    return;
  }

  let parseError: string | null;
  try {
    parseError = await validateDat(file.body, file.size);
  } catch (error) {
    if (!(error instanceof WebAssembly.RuntimeError)) throw error;
    // A parser bug, not the uploader's file: keep the trap for us, and give
    // them a reason they can act on (a retry with a new file starts clean).
    logger.error({ modId, packId, error: error.message }, "DAT parser trapped");
    await failModPermanently(db, modId, packId, "The parser could not process this file");
    return;
  }
  if (parseError) {
    await failModPermanently(db, modId, packId, `Invalid DAT file: ${parseError}`);
    return;
  }

  const processedAt = new Date();
  await db
    .update(mods)
    .set({
      processingStatus: "succeeded",
      processingError: null,
      processedAt,
    })
    .where(eq(mods.id, modId));
  await refreshPackProcessingStatus(db, packId, env);
  logger.info({ modId, packId }, "DAT validation completed");
}

/**
 * Called after every job completes. A processing pack moves to corrupted when a
 * job failed and to pending when all succeeded. A corrupted pack also moves to
 * pending once every job has succeeded: a job the stale sweep timed out may
 * still finish.
 */
export async function refreshPackProcessingStatus(
  db: ReturnType<typeof createDb>,
  packId: string,
  env?: Env
) {
  // The sweep measures inactivity from updatedAt, so each completion counts.
  await db
    .update(packs)
    .set({ updatedAt: new Date() })
    .where(and(eq(packs.id, packId), eq(packs.status, "processing")));
  const pack = await db.query.packs.findFirst({
    where: eq(packs.id, packId),
    columns: {
      id: true,
      status: true,
      expectedModCount: true,
      imageProcessingStatus: true,
    },
  });
  if (!pack || (pack.status !== "processing" && pack.status !== "corrupted")) return;

  const packMods = await db.query.mods.findMany({
    where: eq(mods.packId, packId),
    columns: { processingStatus: true },
  });
  const expectedModCount = pack.expectedModCount || packMods.length;
  if (packMods.length < expectedModCount) return;

  if (
    packMods.some((mod) => mod.processingStatus === "failed") ||
    pack.imageProcessingStatus === "failed"
  ) {
    await transitionPack(db, packId, { from: ["processing"], to: "corrupted" });
    return;
  }

  const modsFinished = packMods.every((mod) => mod.processingStatus === "succeeded");
  const imagesFinished = ["succeeded", "skipped"].includes(pack.imageProcessingStatus);
  if (!modsFinished || !imagesFinished) return;

  if (!(await transitionPack(db, packId, { from: ["processing", "corrupted"], to: "pending" }))) {
    return;
  }
  if (env) await notifyModerators(packId, db, env);
  logger.info({ packId }, "Pack ready for moderation");
}

const IMAGE_VARIANTS = [
  { suffix: "sm", width: 400, height: 350 },
  { suffix: "md", width: 800, height: 700 },
] as const;

function toStream(buffer: ArrayBuffer): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(buffer));
      controller.close();
    },
  });
}

async function optimizeImages(message: OptimizeImagesMessage, env: Env) {
  const { packId, imageKeys } = message;
  const db = createDb(env.DB);
  if (!(await packAwaitsJobs(db, packId))) {
    logger.warn({ packId }, "Skipping image processing for a pack not awaiting it");
    return;
  }

  await db
    .update(packs)
    .set({ imageProcessingStatus: "processing", imageProcessingError: null })
    .where(eq(packs.id, packId));

  // Variants are written first; image keys move to them and the originals are
  // deleted only once every image has its variants. A job that fails partway
  // leaves every original in place, for display and for the retry.
  const finished: { rawKey: string; basePath: string; rawExists: boolean }[] = [];
  for (const rawKey of imageKeys) {
    const basePath = rawKey.replace(/\.[^.]+$/, "");
    const rawObject = await env.BUCKET.get(rawKey);
    if (!rawObject) {
      const existingOutputs = await Promise.all([
        env.BUCKET.head(`${basePath}_sm.webp`),
        env.BUCKET.head(`${basePath}_md.webp`),
        env.BUCKET.head(`${basePath}_full.webp`),
      ]);
      if (existingOutputs.every(Boolean)) {
        finished.push({ rawKey, basePath, rawExists: false });
        continue;
      }
      throw new Error(`Raw image is missing: ${rawKey}`);
    }

    const rawBytes = await rawObject.arrayBuffer();
    for (const variant of IMAGE_VARIANTS) {
      const response = (
        await env.IMAGES.input(toStream(rawBytes))
          .transform({ width: variant.width, height: variant.height, fit: "cover" })
          .output({ format: "image/webp", quality: 80 })
      ).response();
      await env.BUCKET.put(`${basePath}_${variant.suffix}.webp`, await response.arrayBuffer(), {
        httpMetadata: {
          contentType: "image/webp",
          cacheControl: "public, max-age=31536000, immutable",
        },
      });
    }

    const fullResponse = (
      await env.IMAGES.input(toStream(rawBytes))
        .transform({ width: 2048, height: 2048, fit: "scale-down" })
        .output({ format: "image/webp", quality: 85 })
    ).response();
    await env.BUCKET.put(`${basePath}_full.webp`, await fullResponse.arrayBuffer(), {
      httpMetadata: {
        contentType: "image/webp",
        cacheControl: "public, max-age=31536000, immutable",
      },
    });
    finished.push({ rawKey, basePath, rawExists: true });
  }

  for (const { rawKey, basePath } of finished) {
    await db
      .update(packImages)
      .set({ imageKey: basePath })
      .where(and(eq(packImages.packId, packId), eq(packImages.imageKey, rawKey)));
  }
  // The cover is the first image in the uploader's order.
  const cover = await db.query.packImages.findFirst({
    where: eq(packImages.packId, packId),
    orderBy: [asc(packImages.sortOrder)],
    columns: { imageKey: true },
  });
  await db
    .update(packs)
    .set({
      thumbnailKey: cover?.imageKey ?? null,
      imageProcessingStatus: "succeeded",
      imageProcessingError: null,
      updatedAt: new Date(),
    })
    .where(eq(packs.id, packId));
  const originals = finished.filter((image) => image.rawExists).map((image) => image.rawKey);
  if (originals.length > 0) await env.BUCKET.delete(originals);
  await refreshPackProcessingStatus(db, packId, env);
  logger.info({ packId, imageCount: imageKeys.length }, "Image optimization completed");
}

async function recordExhaustedFailure(
  body: QueueMessage,
  error: unknown,
  env: Env,
  attempts: number
) {
  const db = createDb(env.DB);
  const reason = `Processing failed after ${attempts} attempts: ${errorMessage(error)}`;
  if (body.type === "process_dat" && (await packAwaitsJobs(db, body.packId))) {
    await failModPermanently(db, body.modId, body.packId, reason);
  } else if (body.type === "optimize_images") {
    // Only a pack still processing is waiting on this job.
    await transitionPack(db, body.packId, {
      from: ["processing"],
      to: "corrupted",
      set: { imageProcessingStatus: "failed", imageProcessingError: reason },
    });
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function notifyModerators(
  packId: string,
  db: ReturnType<typeof createDb>,
  env: Env
): Promise<void> {
  const pack = await db.query.packs.findFirst({
    where: eq(packs.id, packId),
    with: { game: true, user: true, mods: true },
  });
  if (!pack) return;

  const reviewUrl = "https://textures.gg/admin";
  const tasks: Promise<unknown>[] = [];
  if (env.DISCORD_WEBHOOK_MOD) {
    tasks.push(
      fetch(env.DISCORD_WEBHOOK_MOD, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          embeds: [
            {
              title: "Submission ready for review",
              description: `**${pack.user?.name ?? "Unknown uploader"}** uploaded **${pack.title}** (${pack.mods.length} mods)`,
              url: reviewUrl,
              color: 0x06b6d4,
              fields: [{ name: "Game", value: pack.game?.slug ?? "unknown", inline: true }],
            },
          ],
        }),
      })
    );
  }

  if (env.EMAIL) {
    const moderators = await db.query.users.findMany({
      where: or(eq(users.role, "moderator"), eq(users.role, "admin")),
      columns: { email: true },
    });
    const recipients = moderators.map((moderator) => moderator.email).filter(Boolean);
    tasks.push(
      sendModeratorNotifications(env.EMAIL, recipients, {
        subject: `Submission ready for review: ${pack.title}`,
        html: `<p><strong>${escapeHtml(pack.user?.name ?? "Unknown uploader")}</strong> uploaded <strong>${escapeHtml(pack.title)}</strong>.</p><p>Processing completed successfully and the submission is ready for review.</p><p><a href="${reviewUrl}">Open review queue</a></p>`,
      })
    );
  }

  await Promise.allSettled(tasks);
}
