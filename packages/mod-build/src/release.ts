// Recording a release, with the mods it depends on, and choosing what to
// build when: before review only the newest port's Linux layout checks it;
// approval builds the rest; a new layout builds what players are pointed at.

import {
  approvedReleasesWorthBuilding,
  codeModBuilds,
  codeModLayouts,
  codeModReleaseDependencies,
  codeModReleases,
  codeMods,
  type Database,
} from "@vgskins/db";
import { byVersionDescending, generateId } from "@vgskins/shared";
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
  const error = await manifestRefusal(db, manifest);

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
 * Why the registry refuses the release `manifest` makes, or null: the game
 * would refuse it, or it depends on a mod the registry doesn't have. Checked
 * when a release is recorded and again when a failed one is retried.
 */
export async function manifestRefusal(
  db: Database,
  manifest: SourceManifest
): Promise<string | null> {
  const needed = Object.keys(manifest.depends);
  const found = needed.length
    ? await db
        .select({ slug: codeMods.slug })
        .from(codeMods)
        .where(and(inArray(codeMods.slug, needed), isNull(codeMods.deletedAt)))
    : [];
  const missing = needed.filter((slug) => !found.some((mod) => mod.slug === slug));
  return (
    manifest.refusal ??
    (missing.length
      ? `manifest.json depends on ${missing.join(", ")}, which ${missing.length > 1 ? "aren't" : "isn't"} in the registry`
      : null)
  );
}

/**
 * The releases a newly active `layout` needs builds of: the approved ones
 * worth building (approvedReleasesWorthBuilding: each mod's newest, a
 * set's pin, a version the Slippi mapping names), unless its package has no library (one build serves every
 * layout) or it already has a build for the layout. Review covers the
 * source, so these stay approved.
 */
export async function releasesToBuildFor(
  db: Database,
  layout: string
): Promise<{ releaseId: string; codeModId: string; commitSha: string }[]> {
  const latest = (await approvedReleasesWorthBuilding(db)).map(
    ({ releaseId, codeModId, commitSha }) => ({ releaseId, codeModId, commitSha })
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

/**
 * The layouts the builder image builds mods for: the active ones it carries
 * an SDK for (Linux and Windows), each with its SDK's target triple. A macOS
 * layout (builder `external`) builds on a Mac after review instead.
 */
export async function layoutsToBuild(db: Database): Promise<{ id: string; target: string }[]> {
  return db
    .select({ id: codeModLayouts.id, target: codeModLayouts.target })
    .from(codeModLayouts)
    .where(and(eq(codeModLayouts.active, true), eq(codeModLayouts.builder, "image")))
    .orderBy(codeModLayouts.id);
}

// The target a push is checked on before review.
export const CHECK_TARGET = "x86_64-linux-gnu";

/**
 * The layouts a pushed release builds for before review: the Linux layout of
 * the newest tgg-melee release the image builds for. One build is enough to
 * show a mod maker their mod compiles and to give a reviewer a package; the
 * other targets wait for approval (layoutsAfterApproval).
 */
export async function checkLayouts(db: Database): Promise<{ id: string; target: string }[]> {
  const linux = await db
    .select({
      id: codeModLayouts.id,
      target: codeModLayouts.target,
      portVersion: codeModLayouts.portVersion,
    })
    .from(codeModLayouts)
    .where(
      and(
        eq(codeModLayouts.active, true),
        eq(codeModLayouts.builder, "image"),
        eq(codeModLayouts.target, CHECK_TARGET)
      )
    )
    .orderBy(codeModLayouts.id);
  const newest = linux.map((layout) => layout.portVersion).sort(byVersionDescending)[0];
  return linux
    .filter((layout) => layout.portVersion === newest)
    .map(({ id, target }) => ({ id, target }));
}

/**
 * The layouts an approved release builds for once approved: each active
 * layout the image builds that has no succeeded build of it. None when it
 * isn't approved, its package has no library (its one build serves every
 * layout), or it isn't worth building (approvedReleasesWorthBuilding: an
 * older version nothing points players at keeps the builds it has).
 */
export async function layoutsAfterApproval(
  db: Database,
  releaseId: string
): Promise<{ codeModId: string; commitSha: string; layouts: { id: string; target: string }[] }> {
  const worth = (await approvedReleasesWorthBuilding(db)).find(
    (release) => release.releaseId === releaseId
  );
  if (!worth) return { codeModId: "", commitSha: "", layouts: [] };
  const [release] = await db
    .select({ class: codeModReleases.class })
    .from(codeModReleases)
    .where(eq(codeModReleases.id, releaseId));
  const wanted = release?.class ?? null;
  const builds = await db
    .select({ layoutId: codeModBuilds.layoutId, manifest: codeModBuilds.manifest })
    .from(codeModBuilds)
    .where(and(eq(codeModBuilds.releaseId, releaseId), eq(codeModBuilds.status, "succeeded")));
  const { codeModId, commitSha } = worth;
  if (builds.some((build) => build.layoutId === null)) return { codeModId, commitSha, layouts: [] };
  // A build counts when its package carries the class the review gave the
  // release: the check build, made before review, is built again for a
  // display mod
  const fits = (build: (typeof builds)[number]) =>
    ((build.manifest as { class?: string } | null)?.class ?? null) === wanted;
  const layouts = (await layoutsToBuild(db)).filter(
    (layout) => !builds.some((build) => build.layoutId === layout.id && fits(build))
  );
  return { codeModId, commitSha, layouts };
}

// The most releases one `listings` run reads, so a run stays a bounded number
// of steps; run it again for the rest.
const LIST_LIMIT = 200;

/**
 * Releases recorded before store listings were, whose listing hasn't been
 * read: approved and pending ones of mods that aren't deleted, newest first.
 */
export async function releasesToList(
  db: Database
): Promise<{ releaseId: string; codeModId: string; commitSha: string }[]> {
  return db
    .select({
      releaseId: codeModReleases.id,
      codeModId: codeModReleases.codeModId,
      commitSha: codeModReleases.commitSha,
    })
    .from(codeModReleases)
    .innerJoin(codeMods, eq(codeMods.id, codeModReleases.codeModId))
    .where(
      and(
        inArray(codeModReleases.status, ["approved", "pending"]),
        isNull(codeModReleases.listedAt),
        isNull(codeMods.deletedAt)
      )
    )
    .orderBy(desc(codeModReleases.createdAt))
    .limit(LIST_LIMIT);
}
