// Builds code mods. A tag pushed to a mod's Artifacts repo (`mod-<id>`) starts
// the BuildMod Workflow through the `cf.artifacts.repo.pushed` trigger. It
// records the release, then for each active game layout a Builder container
// compiles and packs the mod against that layout's game SDK. The Worker
// hashes each package and stores it and the compiler log in R2, and records
// the build in D1. The container only ever holds the mod's source and
// the toolchain; the Worker does every write.

import {
  codeModBuilds,
  codeModLayouts,
  codeModReleases,
  codeMods,
  createDb,
  transitionRelease,
} from "@vgskins/db";
import { generateId } from "@vgskins/shared";
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { readManifest, readSource, resolveTag, type Commit } from "./source";
import { storedZip } from "./zip";

export { Builder } from "./builder";

type PushEvent = {
  type: "cf.artifacts.repo.pushed";
  source: { namespace: string; repoName: string };
  payload: { ref: string; before: string; after: string };
};

const TAG_PREFIX = "refs/tags/";
const REPO_PREFIX = "mod-";

type Hooks = { before?: string[]; after?: string[]; replaces?: string[] };

export class BuildMod extends WorkflowEntrypoint<BuildEnv, PushEvent> {
  async run(event: WorkflowEvent<PushEvent>, step: WorkflowStep) {
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

    const layouts = await step.do("active layouts", async () => {
      const rows = await createDb(this.env.DB)
        .select({ id: codeModLayouts.id })
        .from(codeModLayouts)
        .where(eq(codeModLayouts.active, true));
      return rows.map((row) => row.id);
    });

    let built = 0;
    for (const layout of layouts) {
      const buildId = await step.do(`start ${layout}`, () =>
        startBuild(this.env, release.id, layout, event.instanceId)
      );
      try {
        const ok = await step.do(
          `build ${layout}`,
          {
            retries: { limit: 2, delay: "10 seconds", backoff: "exponential" },
            timeout: "5 minutes",
          },
          () => build(this.env, repoName, release.commit, layout, buildId)
        );
        if (ok) built++;
      } catch (error) {
        // The build couldn't run at all; a compile error is recorded by build.
        await step.do(`fail ${layout}`, () =>
          finishBuild(this.env, buildId, { status: "failed", error: String(error).slice(0, 4000) })
        );
      }
    }

    const status = await step.do("finish release", async () => {
      const status = built > 0 ? "pending" : "failed";
      const error =
        built > 0 ? null : layouts.length === 0 ? "no active layouts" : "no build succeeded";
      await transitionRelease(createDb(this.env.DB), release.id, {
        from: ["processing"],
        to: status,
        set: { error },
      });
      return status;
    });
    return { release: release.id, status, built, layouts: layouts.length };
  }
}

type ReleaseStatus = (typeof codeModReleases.$inferSelect)["status"];

/**
 * The release a tag makes, created on first sight. A tag that doesn't name
 * the manifest's version, or a manifest for another mod, makes none, so it
 * can't claim a version a correct tag on the same commit is about to. A
 * redelivered push for the same commit finds the release it made before; a
 * version already released from another commit is refused, since a release
 * never changes.
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
    if (existing.commitSha === commit.id)
      return { id: existing.id, commit, status: existing.status };
    return {
      skipped: `version ${manifest.version} is already released from ${existing.commitSha}`,
    };
  }

  const status: ReleaseStatus = "processing";
  const now = new Date();
  const id = generateId();
  await db.insert(codeModReleases).values({
    id,
    codeModId,
    version: manifest.version,
    tag,
    commitSha: commit.id,
    netplay: manifest.netplay,
    license: manifest.license,
    status,
    createdAt: now,
    updatedAt: now,
  });
  return { id, commit, status };
}

/** The build row for `release` on `layout`, made or reused, set building. */
async function startBuild(
  env: BuildEnv,
  releaseId: string,
  layout: string,
  runId: string
): Promise<string> {
  const db = createDb(env.DB);
  const [existing] = await db
    .select({ id: codeModBuilds.id })
    .from(codeModBuilds)
    .where(and(eq(codeModBuilds.releaseId, releaseId), eq(codeModBuilds.layoutId, layout)));
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
 * Build the mod at `commit` for `layout`, store the package and log, and
 * record the build. Returns whether it built: a mod that doesn't compile, or
 * hooks something the layout can't take, is a failed build, not an error.
 */
async function build(
  env: BuildEnv,
  repoName: string,
  commit: Commit,
  layout: string,
  buildId: string
): Promise<boolean> {
  using repo = await env.ARTIFACTS.get(repoName);
  const source = storedZip(await readSource(repo, commit.tree));
  const result = await env.BUILDER.getByName(buildId).build(layout, source);

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
  };
  const bytes = new Uint8Array(result.zip);
  // Trust only what the Worker hashes itself, not what the container said.
  const sha256 = await sha256Hex(bytes);
  if (sha256 !== report.sha256) {
    throw new Error(`the package read back hashes to ${sha256}, not ${report.sha256}`);
  }
  const packageKey = `code-mods/packages/${sha256}.zip`;
  await env.PACKAGES.put(packageKey, bytes, {
    httpMetadata: { contentType: "application/zip" },
    customMetadata: { build: buildId, layout },
  });
  await finishBuild(env, buildId, {
    status: "succeeded",
    image: result.image,
    packageKey,
    packageSha256: sha256,
    packageSize: bytes.length,
    manifest: report.manifest,
    canonicalHooks: report.canonical_hooks ?? undefined,
    logKey,
  });
  return true;
}

export default {
  async fetch() {
    return new Response("builds run from Artifacts pushes\n", { status: 404 });
  },
} satisfies ExportedHandler<BuildEnv>;
