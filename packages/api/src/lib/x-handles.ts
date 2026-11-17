import { type Database, xHandles } from "@vgskins/db";
import { logger } from "@vgskins/logger";

/**
 * Records the handle X reported for an X account (on sign-in or linking).
 * A failure is logged and never stops the sign-in.
 */
export async function recordXHandle(db: Database, accountId: string, handle: string) {
  try {
    const seenAt = new Date();
    await db
      .insert(xHandles)
      .values({ accountId, handle, seenAt })
      .onConflictDoUpdate({ target: xHandles.accountId, set: { handle, seenAt } });
  } catch (error) {
    logger.warn({ error, accountId }, "Couldn't record an X handle");
  }
}
