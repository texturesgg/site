import { and, eq, inArray } from "drizzle-orm";
import type { SQLiteUpdateSetSource } from "drizzle-orm/sqlite-core";
import type { Database } from "./index";
import { codeModReleases } from "./schema";

type ReleaseStatus = (typeof codeModReleases.$inferSelect)["status"];

/**
 * Move a release from one of `from` to `to`, setting `set` in the same
 * statement. The status guard is in the UPDATE itself, so of two concurrent
 * transitions exactly one wins. Returns whether this call moved the release:
 * false when it is missing or in another status.
 *
 * The only writer of `code_mod_releases.status` after the release is inserted.
 */
export async function transitionRelease(
  db: Database,
  releaseId: string,
  transition: {
    from: ReleaseStatus[];
    to: ReleaseStatus;
    set?: SQLiteUpdateSetSource<typeof codeModReleases>;
  }
): Promise<boolean> {
  const moved = await db
    .update(codeModReleases)
    .set({ updatedAt: new Date(), ...transition.set, status: transition.to })
    .where(and(eq(codeModReleases.id, releaseId), inArray(codeModReleases.status, transition.from)))
    .returning({ id: codeModReleases.id });
  return moved.length > 0;
}
