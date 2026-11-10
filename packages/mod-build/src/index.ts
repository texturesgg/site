// Builds code mods. A tag pushed to a mod's Artifacts repo (`mod-<id>`) starts
// the BuildMod Workflow through the `cf.artifacts.repo.pushed` trigger. It
// records the release and its listing, then checks it before review: a
// Builder container compiles and packs the mod against the game SDK of the
// newest tgg-melee release's Linux layout (checkLayouts; once, for a mod
// without a library, whose package serves every layout). An author gets
// CHECK_RUN_LIMIT of these a day unless trusted or an admin (claimCheckRun);
// past that the release fails without starting a container. The release goes
// to review if the check built. The Worker hashes each package and stores it
// and the compiler log in R2, and records the build in D1. The container only
// ever holds the mod's source and the toolchain; the Worker does every write.
//
// Approving a release (the API's routes/admin.ts) starts it with
// `{type: "approved"}` to build the release for every other active layout
// the image builds (Windows, and an older port's Linux). macOS layouts build
// outside Cloudflare, once a release is approved (scripts/external-build.sh
// and the API's routes/external-builds.ts). An admin's rebuild of a failed
// release starts it with `{type: "check"}`, the same check without the cap.
//
// After a deploy, scripts/build-layouts.sh starts it once per active layout,
// to build the approved releases worth building that have no build for it.

import {
  claimCheckRun,
  codeModBuilds,
  codeModReleases,
  codeMods,
  createDb,
  transitionRelease,
} from "@vgskins/db";
import { generateId } from "@vgskins/shared";
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { readListing, storeListing } from "./listing";
import {
  checkLayouts,
  insertRelease,
  layoutsAfterApproval,
  layoutsToBuild,
  manifestRefusal,
  releasesToBuildFor,
  releasesToList,
  type ReleaseStatus,
} from "./release";
import { hasLibrary, readManifest, readSource, resolveTag, type Commit } from "./source";
import { storedZip } from "./zip";

export { Builder } from "./builder";

type PushEvent = {
  type: "cf.artifacts.repo.pushed";
  source: { namespace: string; repoName: string };
  payload: { ref: string; before: string; after: string };
};

// Sent by scripts/build-layouts.sh after a deploy: build what an active
// layout is missing.
type LayoutEvent = { type: "layout"; layout: string };

// Sent by hand once after listings were added: read the listing of every
// release recorded before them (releasesToList).
type ListingsEvent = { type: "listings" };

// Sent by the API when a moderator approves `release`: build it for the
// layouts its check didn't (layoutsAfterApproval).
type ApprovedEvent = { type: "approved"; release: string };

// Sent by the API when an admin rebuilds `release`, a failed one it has moved
// back to processing: check it again, without the cap.
type CheckEvent = { type: "check"; release: string };

export type BuildEvent = PushEvent | LayoutEvent | ListingsEvent | ApprovedEvent | CheckEvent;

// Why a release over its author's check-run cap fails.
export const CHECK_LIMIT_ERROR = "build limit reached; try again later";

const TAG_PREFIX = "refs/tags/";
const REPO_PREFIX = "mod-";

type Hooks = { before?: string[]; after?: string[]; replaces?: string[] };
// What tgg says a package counts as for netplay.
const NETPLAY_CLASSES = codeModBuilds.netplay.enumValues;

export class BuildMod extends WorkflowEntrypoint<BuildEnv, BuildEvent> {
  async run(event: WorkflowEvent<BuildEvent>, step: WorkflowStep) {
    if (event.payload.type === "layout") {
      return buildLayout(this.env, step, event.payload.layout, event.instanceId);
    }
    if (event.payload.type === "listings") return listReleases(this.env, step);
    if (event.payload.type === "approved") {
      return buildApproved(this.env, step, event.payload.release, event.instanceId);
    }
    if (event.payload.type === "check") {
      return recheck(this.env, step, event.payload.release, event.instanceId);
    }
    const { source, payload } = event.payload;
    if (!payload.ref.startsWith(TAG_PREFIX) || /^0+$/.test(payload.after)) {
      return { skipped: `not a tag: ${payload.ref}` };
    }
    if (!source.repoName.startsWith(REPO_PREFIX)) {
      return { skipped: `not a mod repo: ${source.repoName}` };
    }
    const repoName = source.repoName;
    const tag = payload.ref.slice(TAG_PREFIX.length);

    const release = await step.do("record release", () =>
      recordRelease(this.env, repoName, tag, payload.after)
    );
    if ("skipped" in release) return release;
    if (release.status !== "processing") return { release: release.id, status: release.status };

    return checkRelease(this.env, step, {
      releaseId: release.id,
      repoName,
      commit: release.commit,
      runId: event.instanceId,
      exempt: false,
    });
  }
}

/**
 * Check a processing release before review: record its listing (and
 * re-check its manifest), count a check run against its author unless
 * `exempt`, then build it for checkLayouts. It goes to pending if a build
 * succeeded, failed otherwise.
 */
async function checkRelease(
  env: BuildEnv,
  step: WorkflowStep,
  release: { releaseId: string; repoName: string; commit: Commit; runId: string; exempt: boolean }
) {
  const { releaseId, repoName, commit } = release;
  const fail = (name: string, error: string) =>
    step.do(name, () =>
      transitionRelease(createDb(env.DB), releaseId, {
        from: ["processing"],
        to: "failed",
        set: { error },
      }).then(() => null)
    );

  // The store listing, read before review so review covers it. A listing
  // that can't be read (an icon that isn't a PNG) fails the release.
  const listed = await step.do("record listing", () =>
    recordListing(env, repoName, releaseId, commit)
  );
  if (listed.error !== null) {
    await fail("fail listing", listed.error);
    return { release: releaseId, status: "failed" };
  }

  const allowed = await step.do("claim check run", () =>
    claimCheckRun(createDb(env.DB), {
      id: releaseId,
      runId: release.runId,
      exempt: release.exempt,
    })
  );
  if (!allowed) {
    await fail("fail check limit", CHECK_LIMIT_ERROR);
    return { release: releaseId, status: "failed" };
  }

  // The step's name changed with its result's shape, so a run that started
  // before a deploy doesn't read back the old one.
  const layouts = await step.do("layouts to check", () => checkLayouts(createDb(env.DB)));
  const library = await step.do("has library", async () => {
    using repo = await env.ARTIFACTS.get(repoName);
    return await hasLibrary(repo, commit.tree);
  });
  // A package without a library is the same for every layout, so it builds
  // once, against any layout's SDK, and serves them all.
  const targets: Target[] = library
    ? layouts.map(({ id, target }) => ({ layout: id, sdk: id, target }))
    : layouts.slice(0, 1).map(({ id, target }) => ({ layout: null, sdk: id, target }));

  const built = await buildTargets(env, step, release, targets);

  const status = await step.do("finish release", async () => {
    const status = built > 0 ? "pending" : "failed";
    const error =
      built > 0 ? null : layouts.length === 0 ? "no active layouts" : "no build succeeded";
    await transitionRelease(createDb(env.DB), releaseId, {
      from: ["processing"],
      to: status,
      set: { error },
    });
    return status;
  });
  return { release: releaseId, status, built, layouts: layouts.length };
}

/** The commit `commitSha` of `repoName`, for a release recorded earlier. */
async function releaseCommit(env: BuildEnv, repoName: string, commitSha: string): Promise<Commit> {
  using repo = await env.ARTIFACTS.get(repoName);
  const found = await repo.readCommit(commitSha);
  if (!found) throw new NonRetryableError(`commit ${commitSha} not found`);
  return { id: found.hash, tree: found.treeHash };
}

/** An approved release's builds for the layouts its check didn't cover. */
async function buildApproved(env: BuildEnv, step: WorkflowStep, releaseId: string, runId: string) {
  const work = await step.do("layouts after approval", () =>
    layoutsAfterApproval(createDb(env.DB), releaseId)
  );
  if (work.layouts.length === 0) return { release: releaseId, layouts: 0, built: 0 };
  const repoName = `${REPO_PREFIX}${work.codeModId}`;
  const commit = await step.do(`commit ${releaseId}`, () =>
    releaseCommit(env, repoName, work.commitSha)
  );
  const built = await buildTargets(
    env,
    step,
    { releaseId, repoName, commit, runId },
    work.layouts.map(({ id, target }) => ({ layout: id, sdk: id, target }))
  );
  return { release: releaseId, layouts: work.layouts.length, built };
}

/** Check again a failed release an admin moved back to processing. */
async function recheck(env: BuildEnv, step: WorkflowStep, releaseId: string, runId: string) {
  const found = await step.do("release to check", async () => {
    const [row] = await createDb(env.DB)
      .select({ codeModId: codeModReleases.codeModId, commitSha: codeModReleases.commitSha })
      .from(codeModReleases)
      .where(and(eq(codeModReleases.id, releaseId), eq(codeModReleases.status, "processing")));
    return row ?? null;
  });
  if (!found) return { skipped: `release ${releaseId} isn't processing` };
  const repoName = `${REPO_PREFIX}${found.codeModId}`;
  const commit = await step.do(`commit ${releaseId}`, () =>
    releaseCommit(env, repoName, found.commitSha)
  );
  return checkRelease(env, step, { releaseId, repoName, commit, runId, exempt: true });
}

// What one build makes: the layout its package serves (null for every
// layout), and the layout whose SDK it builds against with that SDK's target.
type Target = { layout: string | null; sdk: string; target: string };

/** Build `release` for each of `targets`, one step each; returns how many built. */
async function buildTargets(
  env: BuildEnv,
  step: WorkflowStep,
  release: { releaseId: string; repoName: string; commit: Commit; runId: string },
  targets: Target[]
): Promise<number> {
  let built = 0;
  for (const target of targets) {
    const name = `${release.releaseId} ${target.layout ?? "every layout"}`;
    const buildId = await step.do(`start ${name}`, () =>
      startBuild(env, release.releaseId, target.layout, release.runId)
    );
    try {
      const ok = await step.do(
        `build ${name}`,
        {
          retries: { limit: 2, delay: "10 seconds", backoff: "exponential" },
          timeout: "5 minutes",
        },
        () => build(env, release.repoName, release.commit, target, buildId)
      );
      if (ok) built++;
    } catch (error) {
      // The build couldn't run at all; a compile error is recorded by build.
      await step.do(`fail ${name}`, () =>
        finishBuild(env, buildId, { status: "failed", error: String(error).slice(0, 4000) })
      );
    }
  }
  return built;
}

/**
 * Build each mod's latest approved release for `layout`, when the builder
 * image builds it and the release has no build for it (releasesToBuildFor).
 */
async function buildLayout(env: BuildEnv, step: WorkflowStep, layout: string, runId: string) {
  const work = await step.do("layout to build", async () => {
    const db = createDb(env.DB);
    const found = (await layoutsToBuild(db)).find((row) => row.id === layout);
    return found ? { target: found.target, releases: await releasesToBuildFor(db, layout) } : null;
  });
  if (!work) return { layout, releases: 0, built: 0 };
  const { target, releases } = work;
  let built = 0;
  for (const release of releases) {
    const repoName = `${REPO_PREFIX}${release.codeModId}`;
    const commit = await step.do(`commit ${release.releaseId}`, () =>
      releaseCommit(env, repoName, release.commitSha)
    );
    built += await buildTargets(
      env,
      step,
      { releaseId: release.releaseId, repoName, commit, runId },
      [{ layout, sdk: layout, target }]
    );
  }
  return { layout, releases: releases.length, built };
}

/** Read and keep the listing of `releaseId` at `commit`; the reason when it can't. */
async function recordListing(
  env: BuildEnv,
  repoName: string,
  releaseId: string,
  commit: Commit
): Promise<{ error: string | null }> {
  using repo = await env.ARTIFACTS.get(repoName);
  let manifest;
  try {
    manifest = await readManifest(repo, commit.id);
  } catch (error) {
    return { error: String(error instanceof Error ? error.message : error) };
  }
  // A retried release was recorded before; the registry may have gained
  // the mod it depends on since, or not.
  const refusal = await manifestRefusal(createDb(env.DB), manifest);
  if (refusal !== null) return { error: refusal };
  const read = await readListing(repo, commit, manifest);
  if ("error" in read) return read;
  await storeListing(createDb(env.DB), env.PACKAGES, releaseId, read.listing);
  return { error: null };
}

/**
 * Read the listing of each release recorded before listings were, one step
 * each. A release whose listing can't be read keeps none; it isn't failed,
 * since it may already be approved.
 */
async function listReleases(env: BuildEnv, step: WorkflowStep) {
  const releases = await step.do("releases to list", () => releasesToList(createDb(env.DB)));
  const failed: { release: string; error: string }[] = [];
  for (const release of releases) {
    const repoName = `${REPO_PREFIX}${release.codeModId}`;
    const listed = await step.do(`list ${release.releaseId}`, async () => {
      using repo = await env.ARTIFACTS.get(repoName);
      const found = await repo.readCommit(release.commitSha);
      if (!found) return { error: `commit ${release.commitSha} not found` };
      return recordListing(env, repoName, release.releaseId, {
        id: found.hash,
        tree: found.treeHash,
      });
    });
    if (listed.error !== null) failed.push({ release: release.releaseId, error: listed.error });
  }
  return { listed: releases.length - failed.length, failed };
}

/**
 * The release a tag makes, created on first sight. A tag that doesn't name
 * the manifest's version, or a manifest for another mod, makes none, so it
 * can't claim a version a correct tag on the same commit is about to. A
 * redelivered push for the same commit finds the release it made before; a
 * version already released from another commit is refused, since a release
 * never changes. A manifest the game would refuse, or one depending on a mod
 * the registry doesn't have, makes a failed release, so its author sees why.
 */
async function recordRelease(
  env: BuildEnv,
  repoName: string,
  tag: string,
  pushed: string
): Promise<{ skipped: string } | { id: string; commit: Commit; status: ReleaseStatus }> {
  const db = createDb(env.DB);
  const codeModId = repoName.slice(REPO_PREFIX.length);
  const [codeMod] = await db
    .select()
    .from(codeMods)
    .where(and(eq(codeMods.id, codeModId), isNull(codeMods.deletedAt)));
  if (!codeMod) return { skipped: `no code mod for ${repoName}` };

  using repo = await env.ARTIFACTS.get(repoName);
  const commit = await resolveTag(repo, tag, pushed);
  const manifest = await readManifest(repo, commit.id);
  if (manifest.id !== codeMod.slug) {
    return { skipped: `manifest.json's id is ${manifest.id}, but this mod is ${codeMod.slug}` };
  }
  // The tag names the version: `1.2.0` or `v1.2.0`.
  if (tag !== manifest.version && tag !== `v${manifest.version}`) {
    return { skipped: `the tag ${tag} doesn't match manifest.json's version ${manifest.version}` };
  }

  const [existing] = await db
    .select()
    .from(codeModReleases)
    .where(
      and(eq(codeModReleases.codeModId, codeModId), eq(codeModReleases.version, manifest.version))
    );
  if (existing) {
    if (existing.commitSha !== commit.id) {
      return {
        skipped: `version ${manifest.version} is already released from ${existing.commitSha}`,
      };
    }
    // Pushing a failed release's tag again (deleted and pushed back) checks
    // it again; the check run counts toward the author's cap as any push.
    if (existing.status === "failed") {
      const retried = await transitionRelease(db, existing.id, {
        from: ["failed"],
        to: "processing",
        set: { error: null },
      });
      if (retried) return { id: existing.id, commit, status: "processing" };
    }
    return { id: existing.id, commit, status: existing.status };
  }

  const { id, status } = await insertRelease(db, {
    codeModId,
    tag,
    commitSha: commit.id,
    manifest,
  });
  return { id, commit, status };
}

/** The build row for `release` on `layout`, made or reused, set building. */
async function startBuild(
  env: BuildEnv,
  releaseId: string,
  layout: string | null,
  runId: string
): Promise<string> {
  const db = createDb(env.DB);
  const [existing] = await db
    .select({ id: codeModBuilds.id })
    .from(codeModBuilds)
    .where(
      and(
        eq(codeModBuilds.releaseId, releaseId),
        layout === null ? isNull(codeModBuilds.layoutId) : eq(codeModBuilds.layoutId, layout)
      )
    );
  if (existing) {
    await db
      .update(codeModBuilds)
      .set({ status: "building", runId, error: null })
      .where(eq(codeModBuilds.id, existing.id));
    return existing.id;
  }
  const id = generateId();
  await db.insert(codeModBuilds).values({
    id,
    releaseId,
    layoutId: layout,
    status: "building",
    runId,
    createdAt: new Date(),
  });
  return id;
}

async function finishBuild(
  env: BuildEnv,
  buildId: string,
  fields: Partial<typeof codeModBuilds.$inferInsert> & { status: "succeeded" | "failed" }
): Promise<void> {
  await createDb(env.DB)
    .update(codeModBuilds)
    .set({ ...fields, finishedAt: new Date() })
    .where(
      and(eq(codeModBuilds.id, buildId), inArray(codeModBuilds.status, ["queued", "building"]))
    );
}

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Build the mod at `commit` for `target`, store the package and log, and
 * record the build. Returns whether it built: a mod that doesn't compile, or
 * hooks something the layout can't take, is a failed build, not an error.
 */
async function build(
  env: BuildEnv,
  repoName: string,
  commit: Commit,
  target: Target,
  buildId: string
): Promise<boolean> {
  using repo = await env.ARTIFACTS.get(repoName);
  const source = storedZip(await readSource(repo, commit.tree));
  // The class a review gave the release, which the package records
  const [release] = await createDb(env.DB)
    .select({ class: codeModReleases.class })
    .from(codeModBuilds)
    .innerJoin(codeModReleases, eq(codeModReleases.id, codeModBuilds.releaseId))
    .where(eq(codeModBuilds.id, buildId));
  const result = await env.BUILDER.getByName(buildId).build(
    target.sdk,
    target.target,
    commit.id,
    release?.class ?? null,
    source
  );

  const logKey = `code-mods/logs/${buildId}.log`;
  await env.PACKAGES.put(logKey, result.log, {
    httpMetadata: { contentType: "text/plain; charset=utf-8" },
  });
  if (!result.ok) {
    await finishBuild(env, buildId, {
      status: "failed",
      image: result.image,
      logKey,
      error: `tgg mod build exited ${result.exitCode}`,
    });
    return false;
  }

  const report = JSON.parse(result.report) as {
    sha256: string;
    manifest: Record<string, unknown>;
    canonical_hooks: Hooks | null;
    netplay: unknown;
  };
  const netplay = NETPLAY_CLASSES.find((value) => value === report.netplay);
  if (!netplay) throw new Error(`tgg reported netplay ${String(report.netplay)}`);
  const bytes = new Uint8Array(result.zip);
  // Trust only what the Worker hashes itself, not what the container said.
  const sha256 = await sha256Hex(bytes);
  if (sha256 !== report.sha256) {
    throw new Error(`the package read back hashes to ${sha256}, not ${report.sha256}`);
  }
  const packageKey = `code-mods/packages/${sha256}.zip`;
  await env.PACKAGES.put(packageKey, bytes, {
    httpMetadata: { contentType: "application/zip" },
    customMetadata: { build: buildId, layout: target.layout ?? "every" },
  });
  await finishBuild(env, buildId, {
    status: "succeeded",
    image: result.image,
    packageKey,
    packageSha256: sha256,
    packageSize: bytes.length,
    manifest: report.manifest,
    canonicalHooks: report.canonical_hooks ?? undefined,
    netplay,
    logKey,
  });
  return true;
}

export default {
  async fetch() {
    return new Response("builds run from Artifacts pushes\n", { status: 404 });
  },
} satisfies ExportedHandler<BuildEnv>;
