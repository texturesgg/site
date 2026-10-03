import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { type Database, deletePackObjects, mods, packs, transitionPack } from "@vgskins/db";
import { logger } from "@vgskins/logger";

// Lost jobs are failed after 24 hours by the hourly cron.
export const STALE_PROCESSING_AGE_MS = 24 * 60 * 60 * 1000;
// A corrupted pack nobody repairs in 30 days is deleted with its files.
export const ABANDONED_CORRUPTED_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const STALE_TIMEOUT_MESSAGE = "Processing timed out before completion";

/**
 * Hourly safety sweep for lost processing jobs.
 *
 * Packs stuck in "processing" past the cutoff are marked corrupted and any mod
 * still queued or processing is marked failed. A lost image job (pack
 * imageProcessingStatus "pending" or "processing") is transitioned to "failed"
 * with an error so the manual images/retry endpoint becomes usable; image work
 * that already reached "succeeded", "skipped", or "failed" is left untouched.
 * A timed-out job that completes later still moves the pack to pending (see
 * refreshPackProcessingStatus). Every job completion bumps updatedAt, so the
 * cutoff measures inactivity, not age.
 */
export async function sweepStaleProcessingPacks(db: Database, now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - STALE_PROCESSING_AGE_MS);
  const stalePacks = await db.query.packs.findMany({
    where: and(eq(packs.status, "processing"), lt(packs.updatedAt, cutoff)),
    columns: { id: true },
  });

  for (const pack of stalePacks) {
    await db
      .update(mods)
      .set({
        processingStatus: "failed",
        processingError: STALE_TIMEOUT_MESSAGE,
        processedAt: now,
      })
      .where(
        and(eq(mods.packId, pack.id), inArray(mods.processingStatus, ["queued", "processing"]))
      );
    await transitionPack(db, pack.id, {
      from: ["processing"],
      to: "corrupted",
      set: {
        updatedAt: now,
        // Commit timeout and retry eligibility together, preserving finished image work.
        imageProcessingStatus: sql`CASE
          WHEN ${packs.imageProcessingStatus} IN ('pending', 'processing') THEN 'failed'
          ELSE ${packs.imageProcessingStatus}
        END`,
        imageProcessingError: sql`CASE
          WHEN ${packs.imageProcessingStatus} IN ('pending', 'processing') THEN ${STALE_TIMEOUT_MESSAGE}
          ELSE ${packs.imageProcessingError}
        END`,
      },
    });
  }

  if (stalePacks.length > 0) {
    logger.warn({ count: stalePacks.length }, "Marked stale processing packs as corrupted");
  }

  return stalePacks.length;
}

/**
 * Hourly cleanup of corrupted packs left unrepaired: a repair moves the pack
 * back to processing, so one still corrupted 30 days after it last changed is
 * abandoned. Its files are deleted first, then the pack is soft-deleted, so a
 * failed delete is retried on the next run.
 */
export async function sweepAbandonedCorruptedPacks(
  db: Database,
  bucket: R2Bucket,
  now: Date
): Promise<number> {
  const cutoff = new Date(now.getTime() - ABANDONED_CORRUPTED_AGE_MS);
  const abandoned = await db.query.packs.findMany({
    where: and(eq(packs.status, "corrupted"), isNull(packs.deletedAt), lt(packs.updatedAt, cutoff)),
    columns: { id: true },
  });

  for (const pack of abandoned) {
    await deletePackObjects(bucket, pack.id);
    await db
      .update(packs)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(packs.id, pack.id), eq(packs.status, "corrupted")));
  }

  if (abandoned.length > 0) {
    logger.warn({ count: abandoned.length }, "Deleted abandoned corrupted packs");
  }
  return abandoned.length;
}
