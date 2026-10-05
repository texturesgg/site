// Recording a release, with the mods it depends on, and finding the releases
// a new layout needs builds of.

import {
  codeModBuilds,
  codeModReleaseDependencies,
  codeModReleases,
  codeMods,
  type Database,
} from "@vgskins/db";
import { generateId } from "@vgskins/shared";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import type { SourceManifest } from "./manifest";

export type ReleaseStatus = (typeof codeModReleases.$inferSelect)["status"];

/**
 * Insert the release `manifest` makes for `codeModId` at `commitSha`. It
 * starts processing, or failed with the reason when the manifest is refused
 * or depends on a mod the registry doesn't have.
 */
export async function insertRelease(
  db: Database,
  release: { codeModId: string; tag: string; commitSha: string; manifest: SourceManifest }
): Promise<{ id: string; status: ReleaseStatus }> {
  const { manifest } = release;
  const needed = Object.keys(manifest.depends);
  const found = needed.length
    ? await db
        .select({ slug: codeMods.slug })
        .from(codeMods)
        .where(and(inArray(codeMods.slug, needed), isNull(codeMods.deletedAt)))
    : [];
  const missing = needed.filter((slug) => !found.some((mod) => mod.slug === slug));
  const error =
    manifest.refusal ??
    (missing.length
      ? `manifest.json depends on ${missing.join(", ")}, which ${missing.length > 1 ? "aren't" : "isn't"} in the registry`
      : null);

  const status: ReleaseStatus = error ? "failed" : "processing";
  const now = new Date();
  const id = generateId();
  const insert = db.insert(codeModReleases).values({
    id,
    codeModId: release.codeModId,
    version: manifest.version,
    tag: release.tag,
    commitSha: release.commitSha,
    license: manifest.license,
    status,
    error,
    createdAt: now,
    updatedAt: now,
  });
  const dependencies = Object.entries(manifest.depends).map(([dependency, range]) => ({
    releaseId: id,
    dependency,
    range,
  }));
  if (dependencies.length) {
    await db.batch([insert, db.insert(codeModReleaseDependencies).values(dependencies)]);
  } else {
    await insert;
  }
  return { id, status };
}

/**
 * The releases a newly active `layout` needs builds of: each mod's latest
 * approved release, unless its package has no library (one build serves every
 * layout) or it already has a build for the layout. Review covers the
 * source, so these stay approved.
 */
export async function releasesToBuildFor(
  db: Database,
  layout: string
): Promise<{ releaseId: string; codeModId: string; commitSha: string }[]> {
  const approved = await db
    .select({
      releaseId: codeModReleases.id,
      codeModId: codeModReleases.codeModId,
      commitSha: codeModReleases.commitSha,
    })
    .from(codeModReleases)
    .innerJoin(codeMods, eq(codeMods.id, codeModReleases.codeModId))
    .where(and(eq(codeModReleases.status, "approved"), isNull(codeMods.deletedAt)))
    .orderBy(desc(codeModReleases.createdAt));
  const latest = approved.filter(
    (release, i) => approved.findIndex((other) => other.codeModId === release.codeModId) === i
  );
  if (latest.length === 0) return [];
  const built = await db
    .select({ releaseId: codeModBuilds.releaseId })
    .from(codeModBuilds)
    .where(
      and(
        inArray(
          codeModBuilds.releaseId,
          latest.map((release) => release.releaseId)
        ),
        or(eq(codeModBuilds.layoutId, layout), isNull(codeModBuilds.layoutId))
      )
    );
  return latest.filter((release) => !built.some((build) => build.releaseId === release.releaseId));
}
