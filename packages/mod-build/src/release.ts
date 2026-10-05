// Recording a release: the row, and the mods it depends on.

import { codeModReleaseDependencies, codeModReleases, codeMods, type Database } from "@vgskins/db";
import { generateId } from "@vgskins/shared";
import { and, inArray, isNull } from "drizzle-orm";
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
