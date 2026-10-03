import { and, eq, inArray, isNull } from "drizzle-orm";
import type { SQLiteUpdateSetSource } from "drizzle-orm/sqlite-core";
import type { Database } from "./index";
import { packs } from "./schema";

type PackStatus = (typeof packs.$inferSelect)["status"];

/**
 * Move a live pack from one of `from` to `to`, setting `set` in the same
 * statement. The status guard is in the UPDATE itself, so of two concurrent
 * transitions exactly one wins. Returns whether this call moved the pack: false
 * when it is missing, deleted, or in another status.
 *
 * The only writer of `packs.status` after the pack is inserted.
 */
export async function transitionPack(
  db: Database,
  packId: string,
  transition: { from: PackStatus[]; to: PackStatus; set?: SQLiteUpdateSetSource<typeof packs> }
): Promise<boolean> {
  const moved = await db
    .update(packs)
    .set({ updatedAt: new Date(), ...transition.set, status: transition.to })
    .where(
      and(eq(packs.id, packId), inArray(packs.status, transition.from), isNull(packs.deletedAt))
    )
    .returning({ id: packs.id });
  return moved.length > 0;
}

/**
 * Delete every R2 object of a pack: its mods, retried mods, uploaded images and
 * their variants, all keyed under packs/<id>/. Returns how many were deleted.
 */
export async function deletePackObjects(bucket: R2Bucket, packId: string): Promise<number> {
  let deleted = 0;
  let cursor: string | undefined;
  do {
    // A page holds at most 1000 keys, as many as one delete accepts.
    const page = await bucket.list({ prefix: `packs/${packId}/`, cursor });
    const keys = page.objects.map((object) => object.key);
    if (keys.length > 0) await bucket.delete(keys);
    deleted += keys.length;
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return deleted;
}
