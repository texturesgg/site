// The build Workflow's choices of what to build when, run through the real
// Workflow with the steps that need Artifacts or a container answered here:
// a push checks only the newest port's Linux layout, an approval builds the
// rest, and the per-author cap stops a push before any container starts.

import { env, introspectWorkflowInstance } from "cloudflare:test";
import {
  CHECK_RUN_LIMIT,
  codeModBuilds,
  codeModCheckRuns,
  codeModLayouts,
  codeModReleases,
  codeMods,
  createDb,
  games,
  users,
} from "@vgskins/db";
import { eq } from "drizzle-orm";
import { beforeAll, expect, it } from "vitest";
import { type BuildEvent, CHECK_LIMIT_ERROR } from "./index";

const db = createDb(env.DB);
const NOW = new Date();
const COMMIT = { id: "c".repeat(40), tree: "t".repeat(40) };
// The newest port's layouts, an older port's Linux one still active, and macOS.
const LINUX = "1111111111111111";
const WINDOWS = "2222222222222222";
const OLD_LINUX = "3333333333333333";
const MACOS = "4444444444444444";

beforeAll(async () => {
  await db.insert(users).values(
    [
      ["author", "user", false],
      ["busy", "user", false],
      ["trusted", "user", true],
      ["admin", "admin", false],
    ].map(([id, role, trusted]) => ({
      id: id as string,
      name: id as string,
      email: `${id as string}@example.com`,
      role: role as "user" | "admin",
      trusted: trusted as boolean,
      createdAt: NOW,
      updatedAt: NOW,
    }))
  );
  await db.insert(games).values({
    id: "melee",
    name: "Super Smash Bros. Melee",
    slug: "melee",
    shortName: "Melee",
    createdAt: NOW,
    updatedAt: NOW,
  });
  await db.insert(codeMods).values(
    ["author", "busy", "trusted", "admin"].map((userId) => ({
      id: `${userId}.mod`,
      userId,
      gameId: "melee",
      slug: `${userId}.mod`,
      name: userId,
      sourceKind: "push" as const,
      createdAt: NOW,
      updatedAt: NOW,
    }))
  );
  await db.insert(codeModLayouts).values(
    [
      [LINUX, "x86_64-linux-gnu", "0.1.0-rc.10", "image"],
      [WINDOWS, "x86_64-windows-gnu", "0.1.0-rc.10", "image"],
      [OLD_LINUX, "x86_64-linux-gnu", "0.1.0-rc.9", "image"],
      [MACOS, "aarch64-apple-darwin", "0.1.0-rc.10", "external"],
    ].map(([id, target, portVersion, builder]) => ({
      id,
      api: "tgg-melee/0",
      port: "tgg-melee",
      target,
      portVersion,
      builder: builder as "image" | "external",
      createdAt: NOW,
    }))
  );
  // `busy` has used every check run of the day, on releases that went nowhere.
  await db.insert(codeModReleases).values({
    id: "busy-old",
    codeModId: "busy.mod",
    version: "0.0.1",
    tag: "v0.0.1",
    commitSha: COMMIT.id,
    status: "rejected",
    createdAt: NOW,
    updatedAt: NOW,
  });
  await db.insert(codeModCheckRuns).values(
    Array.from({ length: CHECK_RUN_LIMIT }, (_, i) => ({
      id: `busy-run-${i}`,
      userId: "busy",
      releaseId: "busy-old",
      createdAt: new Date(NOW.getTime() - 60_000),
    }))
  );
});

async function addRelease(id: string, codeModId: string, version = "1.0.0") {
  await db.insert(codeModReleases).values({
    id,
    codeModId,
    version,
    tag: `v${version}`,
    commitSha: COMMIT.id,
    status: "processing",
    createdAt: NOW,
    updatedAt: NOW,
  });
}

/**
 * Run the Workflow on `params` with each step in `results` answered as given
 * (a build step answers true: it built); its output.
 */
async function runWorkflow(
  instanceId: string,
  params: BuildEvent,
  results: Record<string, unknown>
): Promise<unknown> {
  const instance = await introspectWorkflowInstance(env.BUILD, instanceId);
  try {
    await instance.modify(async (m) => {
      for (const [name, result] of Object.entries(results)) {
        await m.mockStepResult({ name }, result);
      }
    });
    await env.BUILD.create({ id: instanceId, params });
    await instance.waitForStatus("complete");
    return await instance.getOutput();
  } finally {
    await instance.dispose();
  }
}

/** Every layout's build step for `release`, answered as built. */
function builds(release: string): Record<string, true> {
  return Object.fromEntries(
    [LINUX, WINDOWS, OLD_LINUX, MACOS].map((layout) => [`build ${release} ${layout}`, true])
  );
}

/** Run a push of `release` (recorded processing) through the Workflow; its output. */
function push(instanceId: string, release: string, codeModId: string) {
  return runWorkflow(
    instanceId,
    {
      type: "cf.artifacts.repo.pushed",
      source: { namespace: "tgg-mods-dev", repoName: `mod-${codeModId}` },
      payload: { ref: "refs/tags/v1.0.0", before: "0".repeat(40), after: COMMIT.id },
    },
    {
      "record release": { id: release, commit: COMMIT, status: "processing" },
      "record listing": { error: null },
      "has library": true,
      ...builds(release),
    }
  );
}

async function builtLayouts(release: string) {
  const rows = await db
    .select({ layout: codeModBuilds.layoutId })
    .from(codeModBuilds)
    .where(eq(codeModBuilds.releaseId, release));
  return rows.map((row) => row.layout).sort();
}

async function releaseRow(id: string) {
  const [row] = await db.select().from(codeModReleases).where(eq(codeModReleases.id, id));
  return row;
}

it("a push builds only the newest port's Linux layout, then waits for review", async () => {
  await addRelease("pushed", "author.mod");
  expect(await push("push-1", "pushed", "author.mod")).toMatchObject({
    status: "pending",
    built: 1,
    layouts: 1,
  });
  expect(await builtLayouts("pushed")).toEqual([LINUX]);
  expect(await releaseRow("pushed")).toMatchObject({ status: "pending", error: null });
});

it("approval builds the other image layouts, and leaves macOS to the Mac", async () => {
  await db
    .update(codeModReleases)
    .set({ status: "approved" })
    .where(eq(codeModReleases.id, "pushed"));
  await db
    .update(codeModBuilds)
    .set({ status: "succeeded" })
    .where(eq(codeModBuilds.releaseId, "pushed"));

  const output = await runWorkflow(
    "approve-1",
    { type: "approved", release: "pushed" },
    { "commit pushed": COMMIT, ...builds("pushed") }
  );
  expect(output).toEqual({ release: "pushed", layouts: 2, built: 2 });
  expect(await builtLayouts("pushed")).toEqual([LINUX, WINDOWS, OLD_LINUX].sort());
});

it("past the day's check runs a push fails without building", async () => {
  await addRelease("capped", "busy.mod");
  expect(await push("push-2", "capped", "busy.mod")).toEqual({
    release: "capped",
    status: "failed",
  });
  expect(await builtLayouts("capped")).toEqual([]);
  expect(await releaseRow("capped")).toMatchObject({ status: "failed", error: CHECK_LIMIT_ERROR });
});

it("an admin's rebuild of a capped release checks it without the cap", async () => {
  // The API moves the failed release back to processing before starting the run.
  await db
    .update(codeModReleases)
    .set({ status: "processing", error: null })
    .where(eq(codeModReleases.id, "capped"));
  const output = await runWorkflow(
    "check-1",
    { type: "check", release: "capped" },
    {
      "commit capped": COMMIT,
      "record listing": { error: null },
      "has library": true,
      ...builds("capped"),
    }
  );
  expect(output).toMatchObject({ status: "pending", built: 1 });
  expect(await builtLayouts("capped")).toEqual([LINUX]);
});

it("trusted authors and admins skip the cap", async () => {
  for (const userId of ["trusted", "admin"]) {
    await db.insert(codeModCheckRuns).values(
      Array.from({ length: CHECK_RUN_LIMIT }, (_, i) => ({
        id: `${userId}-run-${i}`,
        userId,
        releaseId: "busy-old",
        createdAt: NOW,
      }))
    );
    await addRelease(`${userId}-release`, `${userId}.mod`);
    expect(await push(`push-${userId}`, `${userId}-release`, `${userId}.mod`)).toMatchObject({
      status: "pending",
      built: 1,
    });
  }
});
