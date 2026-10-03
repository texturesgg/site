import { zValidator } from "@hono/zod-validator";
import {
  comments,
  createDb,
  downloads,
  games,
  mods,
  packImages,
  packs,
  packTags,
  tags,
  targetSlots,
  targets,
  transitionPack,
  users,
  votes,
} from "@vgskins/db";
import { logger } from "@vgskins/logger";
import type { PackPeriod, PackSortBy } from "@vgskins/shared";
import {
  CommentInput,
  canonicalDatFileName,
  generateId,
  IMAGE_TYPE_EXTENSIONS,
  LIMITS,
  PACK_PERIODS,
  PACK_SORT_OPTIONS,
  PACK_STATUSES,
  slugify,
  TARGET_CATEGORIES,
  toFileArray,
  UploadPackForm,
  imagesError,
  modFileError,
} from "@vgskins/shared";
import { and, asc, count, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { Zip, ZipDeflate } from "fflate";
import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { writeAnalyticsEvent } from "../lib/analytics";
import { getArtifact } from "../lib/artifacts";
import { attachmentDisposition, zipEntryNames } from "../lib/download";
import { isModerator, optionalAuth, requireAuth } from "../lib/auth";
import { commentNotificationHtml, sendNotification } from "../lib/email";
import { deleteComment } from "../lib/moderation";
import { sendProcessingQueueBatch, sendProcessingQueueMessage } from "../lib/processing-queue";
import { getPack, loadPack } from "../lib/queries";
import { getClientIp, rateLimitByUser } from "../lib/rate-limit";
import { verifyTurnstile } from "../lib/turnstile";
import {
  likeContains,
  paginationResponse,
  parsePagination,
  sanitizeSearch,
  validateEnum,
  validationHook,
} from "../lib/validation";
import type { HonoEnv } from "../types";

// The Browse character picker selects a handful; this bounds the IN list.
const MAX_TARGET_FILTERS = 30;

type ZipFile = { name: string; body: ReadableStream<Uint8Array> };

/**
 * Write `files` to `writable` as a zip, one chunk at a time. Each write waits
 * for the client to read, so memory holds a chunk rather than the pack.
 */
async function writeZip(files: ZipFile[], writable: WritableStream<Uint8Array>, packId: string) {
  const writer = writable.getWriter();
  const output: Uint8Array[] = [];
  let failure: Error | null = null;
  const zip = new Zip((error, chunk) => {
    if (error) failure = error;
    else output.push(chunk);
  });
  const flush = async () => {
    for (const chunk of output.splice(0)) await writer.write(chunk);
    if (failure) throw failure;
  };
  try {
    for (const file of files) {
      const entry = new ZipDeflate(file.name, { level: 6 });
      zip.add(entry);
      for await (const chunk of file.body) {
        entry.push(chunk);
        await flush();
      }
      entry.push(new Uint8Array(0), true);
      await flush();
    }
    zip.end();
    await flush();
    await writer.close();
  } catch (error) {
    logger.error({ packId, error }, "Pack zip download failed while streaming");
    await writer.abort(error);
  }
}

/**
 * Count a served download: the pack's total, a downloads row, and its
 * analytics event. One client's repeated downloads of a pack count once per
 * minute (RATE_LIMIT_DOWNLOAD_COUNT); the file is served either way.
 */
async function countDownload(c: Context<HonoEnv>, packId: string) {
  if (c.env.ENVIRONMENT !== "development") {
    const key = `download:${getClientIp(c)}:${packId}`;
    if (!(await c.env.RATE_LIMIT_DOWNLOAD_COUNT.limit({ key })).success) return;
  }
  const db = createDb(c.env.DB);
  const downloadId = generateId();
  await db.batch([
    db
      .update(packs)
      .set({ downloadCount: sql`${packs.downloadCount} + 1` })
      .where(eq(packs.id, packId)),
    db.insert(downloads).values({ id: downloadId, packId, userId: null, downloadedAt: new Date() }),
  ]);
  writeAnalyticsEvent(c.env.ANALYTICS, { version: 1, type: "download", packId, downloadId });
}

const app = new Hono<HonoEnv>()
  // Upload a new pack (rate limited with the shared 50/min write ceiling per user)
  .post(
    "/",
    requireAuth,
    rateLimitByUser((env) => env.RATE_LIMIT_UPLOAD),
    bodyLimit({
      maxSize: LIMITS.PACK_UPLOAD_BODY_MAX,
      onError: (c) =>
        c.json(
          { error: `A pack's files can add up to ${LIMITS.PACK_FILES_MAX / 1024 / 1024} MB` },
          413
        ),
    }),
    async (c) => {
      const user = c.get("user");
      const db = createDb(c.env.DB);
      const bucket = c.env.BUCKET;
      const queue = c.env.PROCESSING_QUEUE;

      const raw = await c.req.parseBody({ all: true });
      const parsed = UploadPackForm.safeParse(raw);
      if (!parsed.success) {
        return c.json({ error: parsed.error.issues[0].message }, 400);
      }
      const { title, gameId, targetId, description, tags: tagsInput, turnstileToken } = parsed.data;

      if (c.env.TURNSTILE_SECRET) {
        if (!turnstileToken) {
          return c.json({ error: "Bot verification required" }, 400);
        }
        const ip = c.req.header("cf-connecting-ip") ?? "unknown";
        if (!(await verifyTurnstile(turnstileToken, ip, c.env.TURNSTILE_SECRET))) {
          return c.json({ error: "Bot verification failed" }, 400);
        }
      }

      const [target, game] = await Promise.all([
        db.query.targets.findFirst({
          where: and(eq(targets.id, targetId), eq(targets.gameId, gameId)),
        }),
        db.query.games.findFirst({ where: eq(games.id, gameId) }),
      ]);
      if (!target || !game) {
        return c.json({ error: "Target does not belong to the given game" }, 400);
      }

      const toStringArray = (value: unknown): string[] => {
        if (!value) return [];
        return Array.isArray(value) ? value.map(String) : [String(value)];
      };
      const modSlotIds = toStringArray(raw["modSlotIds[]"]);
      const modFiles = toFileArray(raw["modFiles[]"]);
      const modLabels = toStringArray(raw["modLabels[]"]);
      const imageFiles = toFileArray(raw.images);

      if (modFiles.length === 0) {
        return c.json({ error: "At least one mod file is required" }, 400);
      }
      if (modSlotIds.length !== modFiles.length || modLabels.length !== modFiles.length) {
        return c.json({ error: "Every mod requires a file, slot, and title" }, 400);
      }
      if (modFiles.length > LIMITS.PACK_MODS_MAX) {
        return c.json({ error: `Maximum ${LIMITS.PACK_MODS_MAX} mods per pack` }, 400);
      }

      const duplicateSlots = new Set<string>();
      const seenSlots = new Set<string>();
      for (let i = 0; i < modFiles.length; i++) {
        const slotId = modSlotIds[i];
        const label = modLabels[i]?.trim();
        if (!slotId || !label) {
          return c.json({ error: `Mod ${i + 1} requires a slot and title` }, 400);
        }
        if (label.length > LIMITS.MOD_LABEL_MAX) {
          return c.json(
            { error: `Mod ${i + 1} title must be ${LIMITS.MOD_LABEL_MAX} characters or fewer` },
            400
          );
        }
        if (seenSlots.has(slotId)) duplicateSlots.add(slotId);
        seenSlots.add(slotId);
        const modError = modFileError(modFiles[i], `Mod ${i + 1} file`);
        if (modError) return c.json({ error: modError }, 400);
      }
      if (duplicateSlots.size > 0) {
        return c.json({ error: "Each mod in a pack must use a different slot" }, 400);
      }

      const validSlots = await db.query.targetSlots.findMany({
        where: eq(targetSlots.targetId, targetId),
      });
      const validSlotIds = new Set(validSlots.map((slot) => slot.id));
      const invalidSlotIndex = modSlotIds.findIndex((slotId) => !validSlotIds.has(slotId));
      if (invalidSlotIndex !== -1) {
        return c.json(
          { error: `Mod ${invalidSlotIndex + 1}: slot does not belong to the selected target` },
          400
        );
      }
      const imageError = imagesError(imageFiles);
      if (imageError) return c.json({ error: imageError }, 400);

      const packId = generateId();
      const baseSlug = slugify(title) || "submission";
      const packSlug = `${baseSlug}-${packId.slice(-6).toLowerCase()}`;
      const now = new Date();
      const imageKeys = imageFiles.map((image, index) => {
        // imagesError has already limited the type to these.
        return `packs/${packId}/images/${index}.${IMAGE_TYPE_EXTENSIONS[image.type]}`;
      });
      const modRecords = modFiles.map((file, index) => {
        const modId = generateId();
        const fileName = canonicalDatFileName(file.name);
        return {
          id: modId,
          packId,
          slotId: modSlotIds[index],
          fileKey: `packs/${packId}/mods/${modId}/${fileName}`,
          fileName,
          label: modLabels[index].trim(),
          createdAt: now,
          processingStatus: "queued" as const,
          processingError: null,
          processedAt: null,
        };
      });
      const uploadedKeys: string[] = [];
      let packInserted = false;

      try {
        for (let i = 0; i < imageFiles.length; i++) {
          await bucket.put(imageKeys[i], imageFiles[i]);
          uploadedKeys.push(imageKeys[i]);
        }
        for (let i = 0; i < modFiles.length; i++) {
          await bucket.put(modRecords[i].fileKey, modFiles[i], {
            httpMetadata: {
              contentType: modFiles[i].type || "application/octet-stream",
              cacheControl: "public, max-age=31536000, immutable",
            },
          });
          uploadedKeys.push(modRecords[i].fileKey);
        }

        await db.insert(packs).values({
          id: packId,
          userId: user.id,
          gameId,
          targetId,
          title,
          slug: packSlug,
          description: description ?? null,
          thumbnailKey: imageKeys[0] || null,
          status: "processing",
          expectedModCount: modRecords.length,
          imageProcessingStatus: imageKeys.length > 0 ? "pending" : "skipped",
          imageProcessingError: null,
          downloadCount: 0,
          createdAt: now,
          updatedAt: now,
        });
        packInserted = true;

        await db.insert(mods).values(modRecords);
        if (imageKeys.length > 0) {
          await db.insert(packImages).values(
            imageKeys.map((imageKey, index) => ({
              id: generateId(),
              packId,
              imageKey,
              sortOrder: index,
            }))
          );
        }

        const tagNames = tagsInput
          ? tagsInput
              .split(",")
              .map((tag) => tag.trim())
              .filter(Boolean)
              .slice(0, LIMITS.TAG_COUNT_MAX)
          : [];
        for (const tagName of tagNames) {
          const tagSlug = slugify(tagName);
          if (!tagSlug) continue;

          const tagId = generateId();
          await db
            .insert(tags)
            .values({ id: tagId, name: tagName, slug: tagSlug })
            .onConflictDoNothing();
          const existingTag = await db.query.tags.findFirst({
            where: eq(tags.slug, tagSlug),
          });
          if (existingTag) {
            await db
              .insert(packTags)
              .values({ packId, tagId: existingTag.id })
              .onConflictDoNothing();
          }
        }

        await sendProcessingQueueBatch(queue, [
          ...modRecords.map((mod) => ({
            type: "process_dat" as const,
            modId: mod.id,
            packId,
          })),
          ...(imageKeys.length > 0
            ? [{ type: "optimize_images" as const, packId, imageKeys }]
            : []),
        ]);
      } catch (error) {
        if (packInserted) {
          await db
            .delete(packs)
            .where(eq(packs.id, packId))
            .catch((cleanupError) => {
              logger.error({ packId, cleanupError }, "Failed to remove partial upload record");
            });
        }
        if (uploadedKeys.length > 0) {
          await bucket.delete(uploadedKeys).catch((cleanupError) => {
            logger.error({ packId, uploadedKeys, cleanupError }, "Failed to remove partial upload");
          });
        }
        throw error;
      }

      logger.info(
        { packId, packSlug, modCount: modRecords.length },
        "Pack uploaded and queued for processing"
      );
      return c.json({ id: packId, slug: packSlug, gameSlug: game.slug }, 200);
    }
  )
  // List packs with filtering and pagination. Only moderators may list a status
  // other than approved.
  .get(
    "/",
    optionalAuth,
    zValidator(
      "query",
      z.object({
        game: z.string().optional(),
        // One or more target slugs, comma-separated: "fox,falco".
        target: z.string().optional(),
        category: z.enum(TARGET_CATEGORIES).optional(),
        tag: z.string().optional(),
        status: z.string().optional(),
        search: z.string().optional(),
        sortBy: z.string().optional(),
        period: z.string().optional(),
        page: z.string().optional(),
        pageSize: z.string().optional(),
      }),
      validationHook
    ),
    async (c) => {
      const db = createDb(c.env.DB);
      const query = c.req.valid("query");

      // Parse and validate inputs
      const pagination = parsePagination(query);
      const gameSlug = query.game;
      const targetSlugs = [
        ...new Set(
          (query.target ?? "")
            .split(",")
            .map((slug) => slug.trim())
            .filter(Boolean)
        ),
      ];
      if (targetSlugs.length > MAX_TARGET_FILTERS) {
        return c.json(
          { error: `Filter by at most ${MAX_TARGET_FILTERS} characters or stages` },
          400
        );
      }
      const tagSlug = query.tag;
      const status = validateEnum(query.status, PACK_STATUSES, "approved");
      if (status !== "approved" && !isModerator(c.get("user"))) {
        return c.json({ error: "Moderator access required" }, 403);
      }
      const search = sanitizeSearch(query.search);
      const sortBy = validateEnum(query.sortBy, PACK_SORT_OPTIONS, "hot") as PackSortBy;
      const period = validateEnum(query.period, PACK_PERIODS, "all") as PackPeriod;

      logger.info(
        {
          gameSlug,
          targetSlugs,
          category: query.category,
          tagSlug,
          status,
          search,
          sortBy,
          ...pagination,
        },
        "Listing packs"
      );

      // Period filter
      const getPeriodFilter = () => {
        const now = Date.now();
        switch (period) {
          case "week":
            return now - 7 * 24 * 60 * 60 * 1000;
          case "month":
            return now - 30 * 24 * 60 * 60 * 1000;
          case "year":
            return now - 365 * 24 * 60 * 60 * 1000;
          default:
            return null;
        }
      };

      const periodFilter = sortBy === "top" || sortBy === "downloads" ? getPeriodFilter() : null;

      // Build conditions
      const conditions = [eq(packs.status, status!), isNull(packs.deletedAt)];
      if (gameSlug) conditions.push(eq(games.slug, gameSlug));
      if (targetSlugs.length > 0) conditions.push(inArray(targets.slug, targetSlugs));
      if (query.category) conditions.push(eq(targets.category, query.category));
      if (search) {
        // or() types as SQL | undefined even with non-empty arguments
        conditions.push(
          or(likeContains(packs.title, search), likeContains(packs.description, search))!
        );
      }
      if (tagSlug) conditions.push(eq(tags.slug, tagSlug));
      if (periodFilter) conditions.push(sql`${packs.publishedAt} >= ${periodFilter}`);

      const where = and(...conditions);

      // Vote count subquery
      const voteCount = sql<number>`(SELECT COUNT(*) FROM votes WHERE votes.pack_id = packs.id)`.as(
        "vote_count"
      );

      // Hot score
      const hotScore =
        sql<number>`((SELECT COUNT(*) FROM votes WHERE votes.pack_id = packs.id) + ${packs.downloadCount} * 0.5) / pow((CAST((strftime('%s', 'now') * 1000 - ${packs.publishedAt}) AS REAL) / 3600000.0) + 2, 1.5)`.as(
          "hot_score"
        );

      // Mod count subquery
      const modCount = sql<number>`(SELECT COUNT(*) FROM mods WHERE mods.pack_id = packs.id)`.as(
        "mod_count"
      );

      const packsSelect = db
        .select({
          id: packs.id,
          userId: packs.userId,
          gameId: packs.gameId,
          targetId: packs.targetId,
          title: packs.title,
          slug: packs.slug,
          description: packs.description,
          thumbnailKey: packs.thumbnailKey,
          status: packs.status,
          downloadCount: packs.downloadCount,
          source: packs.source,
          sourceId: packs.sourceId,
          createdAt: packs.createdAt,
          updatedAt: packs.updatedAt,
          publishedAt: packs.publishedAt,
          deletedAt: packs.deletedAt,
          voteCount,
          hotScore,
          modCount,
          gameName: games.name,
          gameSlug: games.slug,
          targetName: targets.name,
          targetSlug: targets.slug,
          targetCategory: targets.category,
          creatorName: users.name,
          creatorImage: users.image,
        })
        .from(packs)
        .leftJoin(games, eq(packs.gameId, games.id))
        .leftJoin(targets, eq(packs.targetId, targets.id))
        .leftJoin(users, eq(packs.userId, users.id));

      if (tagSlug) {
        packsSelect
          .innerJoin(packTags, eq(packs.id, packTags.packId))
          .innerJoin(tags, eq(packTags.tagId, tags.id));
      }

      packsSelect.where(where);

      // Sorting
      const orderClause =
        sortBy === "hot"
          ? [desc(sql`hot_score`), desc(sql`published_at`)]
          : sortBy === "top"
            ? [desc(sql`vote_count`), desc(sql`published_at`)]
            : sortBy === "downloads"
              ? [desc(packs.downloadCount), desc(sql`published_at`)]
              : [desc(sql`published_at`)];

      const items = await packsSelect
        .orderBy(...orderClause)
        .limit(pagination.pageSize)
        .offset(pagination.offset);

      // Total count
      const countQuery = db
        .select({ total: count() })
        .from(packs)
        .leftJoin(games, eq(packs.gameId, games.id))
        .leftJoin(targets, eq(packs.targetId, targets.id));
      if (tagSlug) {
        countQuery
          .innerJoin(packTags, eq(packs.id, packTags.packId))
          .innerJoin(tags, eq(packTags.tagId, tags.id));
      }
      const [{ total }] = await countQuery.where(where);

      return c.json(paginationResponse(items, total, pagination), 200);
    }
  )
  // Toggle vote on a pack (requires auth)
  .post("/by-id/:id/vote", requireAuth, async (c) => {
    const user = c.get("user");
    const db = createDb(c.env.DB);
    const packId = c.req.param("id");

    logger.info({ packId, userId: user.id }, "Toggling vote");

    if (!(await loadPack(db, { id: packId }, { requester: null }))) {
      return c.json({ error: "Pack not found" }, 404);
    }

    // The unique (user, pack) index decides: an insert that changes nothing
    // means the vote existed, so this toggle removes it. Concurrent toggles
    // each take one branch instead of racing a read against the insert.
    const inserted = await db
      .insert(votes)
      .values({ userId: user.id, packId, createdAt: new Date() })
      .onConflictDoNothing();
    const voted = inserted.meta.changes > 0;
    if (voted) {
      writeAnalyticsEvent(c.env.ANALYTICS, {
        version: 1,
        type: "vote",
        packId,
      });
      logger.info({ packId, userId: user.id }, "Vote added");
    } else {
      await db.delete(votes).where(and(eq(votes.userId, user.id), eq(votes.packId, packId)));
      logger.info({ packId, userId: user.id }, "Vote removed");
    }

    const [voteRow] = await db
      .select({ value: count() })
      .from(votes)
      .where(eq(votes.packId, packId));

    return c.json(
      {
        voted,
        voteCount: voteRow?.value ?? 0,
      },
      200
    );
  })
  // Get vote status for a pack
  .get("/by-id/:id/vote", optionalAuth, async (c) => {
    const user = c.get("user");
    const db = createDb(c.env.DB);
    const packId = c.req.param("id");

    if (!(await loadPack(db, { id: packId }, { requester: user }))) {
      return c.json({ error: "Pack not found" }, 404);
    }

    const [voteRow] = await db
      .select({ value: count() })
      .from(votes)
      .where(eq(votes.packId, packId));

    let voted = false;
    if (user) {
      const existingVote = await db.query.votes.findFirst({
        where: and(eq(votes.userId, user.id), eq(votes.packId, packId)),
      });
      voted = !!existingVote;
    }

    return c.json(
      {
        voted,
        voteCount: voteRow?.value ?? 0,
      },
      200
    );
  })
  // Replace a failed mod file and enqueue validation again.
  .post(
    "/by-id/:id/mods/:modId/retry",
    requireAuth,
    rateLimitByUser((env) => env.RATE_LIMIT_UPLOAD),
    // One DAT and the multipart framing around it.
    bodyLimit({
      maxSize: LIMITS.FILE_SIZE_DAT + 64 * 1024,
      onError: (c) =>
        c.json(
          { error: `Mod file must be less than ${LIMITS.FILE_SIZE_DAT / 1024 / 1024}MB` },
          413
        ),
    }),
    async (c) => {
      const user = c.get("user");
      const db = createDb(c.env.DB);
      const packId = c.req.param("id");
      const modId = c.req.param("modId");
      const pack = await getPack(db, packId);
      if (!pack || (pack.userId !== user.id && !isModerator(user))) {
        return c.json({ error: "Pack not found" }, 404);
      }

      const mod = await db.query.mods.findFirst({
        where: and(eq(mods.id, modId), eq(mods.packId, packId)),
      });
      if (!mod) {
        return c.json({ error: "Mod not found" }, 404);
      }
      if (mod.processingStatus !== "failed") {
        return c.json({ error: "Only failed mod files can be replaced" }, 400);
      }

      const raw = await c.req.parseBody({ all: true });
      const file = raw.file;
      if (!(file instanceof File)) return c.json({ error: "Mod file is required" }, 400);
      const modError = modFileError(file);
      if (modError) return c.json({ error: modError }, 400);
      const fileName = canonicalDatFileName(file.name);
      const newFileKey = `packs/${packId}/mods/${modId}/retry-${generateId()}.dat`;

      // R2 needs the length up front, which a File has and its stream does not.
      await c.env.BUCKET.put(newFileKey, file, {
        httpMetadata: {
          contentType: file.type || "application/octet-stream",
          cacheControl: "public, max-age=31536000, immutable",
        },
      });
      // A failed mod leaves its pack corrupted, or processing while other jobs finish.
      if (
        !(await transitionPack(db, packId, { from: ["corrupted", "processing"], to: "processing" }))
      ) {
        await c.env.BUCKET.delete(newFileKey);
        return c.json({ error: "This pack is not waiting on a failed file" }, 409);
      }
      try {
        await db
          .update(mods)
          .set({
            fileKey: newFileKey,
            fileName,
            processingStatus: "queued",
            processingError: null,
            processedAt: null,
          })
          .where(and(eq(mods.id, modId), eq(mods.packId, packId)));
        await sendProcessingQueueMessage(c.env.PROCESSING_QUEUE, {
          type: "process_dat",
          modId,
          packId,
        });
      } catch (error) {
        await db
          .update(mods)
          .set({
            fileKey: mod.fileKey,
            fileName: mod.fileName,
            processingStatus: "failed",
            processingError: mod.processingError,
            processedAt: mod.processedAt,
          })
          .where(and(eq(mods.id, modId), eq(mods.packId, packId)));
        await transitionPack(db, packId, { from: ["processing"], to: pack.status });
        await c.env.BUCKET.delete(newFileKey);
        throw error;
      }

      if (mod.fileKey !== newFileKey) {
        await c.env.BUCKET.delete(mod.fileKey).catch((error) => {
          logger.warn({ error, fileKey: mod.fileKey }, "Failed to remove replaced mod file");
        });
      }
      return c.json({ success: true }, 200);
    }
  )
  // Retry image processing from the retained originals.
  .post("/by-id/:id/images/retry", requireAuth, async (c) => {
    const user = c.get("user");
    const db = createDb(c.env.DB);
    const packId = c.req.param("id");
    const pack = await db.query.packs.findFirst({
      where: and(eq(packs.id, packId), isNull(packs.deletedAt)),
      with: { images: { orderBy: (image, { asc }) => [asc(image.sortOrder)] } },
    });
    const canManage = pack && (pack.userId === user.id || isModerator(user));
    if (!pack || !canManage) {
      return c.json({ error: "Pack not found" }, 404);
    }
    if (pack.imageProcessingStatus !== "failed") {
      return c.json({ error: "Preview image processing has not failed" }, 400);
    }
    if (pack.images.length === 0) {
      return c.json({ error: "This pack has no preview images" }, 400);
    }

    const restarted = await transitionPack(db, packId, {
      from: ["corrupted"],
      to: "processing",
      set: { imageProcessingStatus: "pending", imageProcessingError: null },
    });
    if (!restarted) {
      return c.json({ error: "This pack is not waiting on its preview images" }, 409);
    }
    try {
      await sendProcessingQueueMessage(c.env.PROCESSING_QUEUE, {
        type: "optimize_images",
        packId,
        imageKeys: pack.images.map((image) => image.imageKey),
      });
    } catch (error) {
      await transitionPack(db, packId, {
        from: ["processing"],
        to: pack.status,
        set: { imageProcessingStatus: "failed", imageProcessingError: pack.imageProcessingError },
      });
      throw error;
    }

    return c.json({ success: true }, 200);
  })
  // Download pack — single mod streams directly, multi-mod zips
  .get("/by-id/:id/download", async (c) => {
    const db = createDb(c.env.DB);
    const packId = c.req.param("id");

    // Only an approved pack downloads, whoever asks.
    const pack = await loadPack(db, { id: packId }, { requester: null, with: { mods: true } });
    if (!pack) {
      return c.json({ error: "Pack not found" }, 404);
    }
    if (pack.mods.length === 0) {
      return c.json({ error: "No files found in pack" }, 404);
    }

    // Single mod — stream directly
    if (pack.mods.length === 1) {
      const mod = pack.mods[0];
      const obj = await getArtifact(c.env, mod.fileKey);
      if (!obj) {
        // An approved pack whose mod object is gone is a storage problem, not a
        // client error; log it so the missing artifact is traceable.
        logger.warn(
          { packId, modId: mod.id, fileKey: mod.fileKey },
          "Pack download artifact is missing from storage"
        );
        return c.json({ error: "File not found" }, 404);
      }

      await countDownload(c, packId);
      logger.info({ packId, modId: mod.id }, "Single mod download served");

      return new Response(obj.body, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": attachmentDisposition(canonicalDatFileName(mod.fileName)),
        },
      });
    }

    // Multi-mod — a zip, streamed a chunk at a time instead of built in memory
    const entryNames = zipEntryNames(pack.mods.map((mod) => mod.fileName));
    const files: ZipFile[] = [];
    const missingMods: string[] = [];
    for (const [index, mod] of pack.mods.entries()) {
      const obj = await getArtifact(c.env, mod.fileKey);
      if (obj?.body) files.push({ name: entryNames[index], body: obj.body });
      else missingMods.push(mod.id);
    }

    if (missingMods.length > 0) {
      // Silently omitting mods from a zip is a storage problem the downloader
      // cannot see; log which mods were dropped from the archive.
      logger.warn(
        { packId, missingMods, servedMods: files.length },
        "Pack zip download is missing mod files from storage"
      );
    }

    if (files.length === 0) {
      return c.json({ error: "No files found in pack" }, 404);
    }

    await countDownload(c, packId);
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    c.executionCtx.waitUntil(writeZip(files, writable, packId));

    logger.info({ packId, fileCount: files.length }, "Pack zip download served");

    return new Response(readable, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": attachmentDisposition(`${pack.slug}.zip`),
      },
    });
  })
  // Download individual mod
  .get("/by-id/:id/mods/:modId/download", async (c) => {
    const db = createDb(c.env.DB);
    const packId = c.req.param("id");
    const modId = c.req.param("modId");

    if (!(await loadPack(db, { id: packId }, { requester: null }))) {
      return c.json({ error: "Pack not found" }, 404);
    }

    const mod = await db.query.mods.findFirst({
      where: and(eq(mods.id, modId), eq(mods.packId, packId)),
    });
    if (!mod) {
      return c.json({ error: "Mod not found" }, 404);
    }

    const obj = await getArtifact(c.env, mod.fileKey);
    if (!obj) {
      logger.warn(
        { packId, modId: mod.id, fileKey: mod.fileKey },
        "Mod download artifact is missing from storage"
      );
      return c.json({ error: "File not found" }, 404);
    }

    return new Response(obj.body, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": attachmentDisposition(canonicalDatFileName(mod.fileName)),
      },
    });
  })
  // List comments for a pack
  .get("/by-id/:id/comments", optionalAuth, async (c) => {
    const db = createDb(c.env.DB);
    const packId = c.req.param("id");

    // The pack page shows comments, so they follow the page's visibility.
    if (!(await loadPack(db, { id: packId }, { requester: c.get("user") }))) {
      return c.json({ error: "Pack not found" }, 404);
    }

    const rows = await db
      .select({
        id: comments.id,
        body: comments.body,
        parentId: comments.parentId,
        createdAt: comments.createdAt,
        userId: comments.userId,
        userName: users.name,
        userImage: users.image,
        source: comments.source,
      })
      .from(comments)
      .leftJoin(users, eq(comments.userId, users.id))
      .where(eq(comments.packId, packId))
      .orderBy(asc(comments.createdAt));

    return c.json({ comments: rows }, 200);
  })
  // Post a comment (rate limited with the shared 50/min write ceiling per user)
  .post(
    "/by-id/:id/comments",
    requireAuth,
    rateLimitByUser((env) => env.RATE_LIMIT_UPLOAD),
    zValidator("json", CommentInput, validationHook),
    async (c) => {
      const user = c.get("user");
      const db = createDb(c.env.DB);
      const packId = c.req.param("id");
      const { body, parentId } = c.req.valid("json");

      // Only an approved pack takes comments.
      const pack = await loadPack(db, { id: packId }, { requester: null });
      if (!pack) return c.json({ error: "Pack not found" }, 404);

      // Validate parent comment if replying
      let resolvedParentId: string | null = null;
      if (parentId) {
        const parent = await db.query.comments.findFirst({
          where: and(eq(comments.id, parentId), eq(comments.packId, packId)),
        });
        if (!parent) {
          return c.json({ error: "Parent comment not found" }, 400);
        }
        // Enforce max depth 1: if parent is itself a reply, attach to its parent
        resolvedParentId = parent.parentId ?? parent.id;
      }

      const commentId = generateId();
      const now = new Date();

      await db.insert(comments).values({
        id: commentId,
        packId,
        userId: user.id,
        parentId: resolvedParentId,
        body,
        createdAt: now,
        updatedAt: now,
      });

      // Notify pack owner about the comment (fire-and-forget)
      if (pack.userId && pack.userId !== user.id) {
        const owner = await db.query.users.findFirst({
          where: eq(users.id, pack.userId),
          columns: { email: true },
        });
        if (owner?.email) {
          const game = await db.query.games.findFirst({
            where: eq(games.id, pack.gameId),
            columns: { slug: true },
          });
          const packUrl = `https://textures.gg/games/${game?.slug ?? "melee"}/packs/${pack.slug}`;
          c.executionCtx.waitUntil(
            sendNotification(c.env.EMAIL, {
              to: owner.email,
              subject: `New comment on "${pack.title}"`,
              html: commentNotificationHtml({
                skinTitle: pack.title,
                commenterName: user.name,
                commentBody: body,
                skinUrl: packUrl,
              }),
            })
          );
        }
      }

      return c.json(
        {
          id: commentId,
          body,
          parentId: resolvedParentId,
          createdAt: now.getTime(),
          userId: user.id,
          userName: user.name,
          userImage: user.image,
        },
        200
      );
    }
  )
  // Delete a comment
  .delete("/by-id/:id/comments/:commentId", requireAuth, async (c) => {
    const user = c.get("user");
    const db = createDb(c.env.DB);
    const packId = c.req.param("id");
    const commentId = c.req.param("commentId");

    const comment = await db.query.comments.findFirst({
      where: and(eq(comments.id, commentId), eq(comments.packId, packId)),
    });

    if (!comment) {
      return c.json({ error: "Comment not found" }, 404);
    }

    // Only allow author or moderator/admin
    const isAuthor = comment.userId === user.id;
    const isMod = isModerator(user);
    if (!isAuthor && !isMod) {
      return c.json({ error: "Not authorized to delete this comment" }, 403);
    }

    await deleteComment(db, commentId);

    return c.json({ success: true }, 200);
  });

export default app;
