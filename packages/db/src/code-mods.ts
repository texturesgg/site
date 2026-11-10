import { releasesWorthBuilding } from "@vgskins/shared";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { SQLiteUpdateSetSource } from "drizzle-orm/sqlite-core";
import type { Database } from "./index";
import { codeModCheckRuns, codeModReleases, codeMods, codeModSetMods, users } from "./schema";

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

export type ReleaseToBuild = {
  releaseId: string;
  codeModId: string;
  commitSha: string;
  mod: string;
  version: string;
  // The class its review gave it ("display"), which its packages record
  class: "display" | null;
};

/**
 * The approved releases of mods that aren't deleted worth a build for a new
 * target (releasesWorthBuilding): each mod's newest version, the newest one
 * inside each set's range for the mod when the newest is outside it, and the
 * versions the Slippi mapping names exactly. A new layout, an approval and the external builder build only these, so an
 * older version nobody is pointed at never costs a build.
 */
export async function approvedReleasesWorthBuilding(db: Database): Promise<ReleaseToBuild[]> {
  const [approved, ranges] = await Promise.all([
    db
      .select({
        releaseId: codeModReleases.id,
        codeModId: codeModReleases.codeModId,
        commitSha: codeModReleases.commitSha,
        mod: codeMods.slug,
        version: codeModReleases.version,
        class: codeModReleases.class,
        slippi: codeModReleases.slippi,
      })
      .from(codeModReleases)
      .innerJoin(codeMods, eq(codeMods.id, codeModReleases.codeModId))
      .where(and(eq(codeModReleases.status, "approved"), isNull(codeMods.deletedAt))),
    db.select({ mod: codeModSetMods.mod, range: codeModSetMods.range }).from(codeModSetMods),
  ]);
  return releasesWorthBuilding(approved, ranges).map(({ slippi: _, ...release }) => release);
}

// Pre-approval check runs an author gets in CHECK_RUN_WINDOW_MS, unless
// trusted or an admin.
export const CHECK_RUN_LIMIT = 10;
export const CHECK_RUN_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Count a check run of `releaseId` against its mod's author, unless they have
 * had CHECK_RUN_LIMIT in the last day; trusted authors and admins always get
 * one, and `exempt` (an admin's rebuild) skips the cap. One INSERT ... SELECT
 * checks and counts, so concurrent pushes can't both take the last run.
 * Returns whether the run may go ahead.
 */
export async function claimCheckRun(
  db: Database,
  release: { id: string; runId: string; exempt?: boolean },
  now = new Date()
): Promise<boolean> {
  const since = now.getTime() - CHECK_RUN_WINDOW_MS;
  const inserted = await db.all<{ id: string }>(sql`
    INSERT INTO ${codeModCheckRuns} (id, user_id, release_id, created_at)
    SELECT ${release.runId}, ${codeMods.userId}, ${codeModReleases.id}, ${now.getTime()}
    FROM ${codeModReleases}
    INNER JOIN ${codeMods} ON ${codeMods.id} = ${codeModReleases.codeModId}
    INNER JOIN ${users} ON ${users.id} = ${codeMods.userId}
    WHERE ${codeModReleases.id} = ${release.id}
      AND (
        ${release.exempt ? 1 : 0} = 1
        OR ${users.trusted} = 1
        OR ${users.role} = 'admin'
        OR (
          SELECT count(*) FROM ${codeModCheckRuns} AS runs
          WHERE runs.user_id = ${codeMods.userId} AND runs.created_at > ${since}
        ) < ${CHECK_RUN_LIMIT}
      )
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  `);
  if (inserted.length > 0) return true;
  // A Workflow step that retries after its insert landed finds its own run.
  const [mine] = await db
    .select({ id: codeModCheckRuns.id })
    .from(codeModCheckRuns)
    .where(eq(codeModCheckRuns.id, release.runId));
  return mine !== undefined;
}
