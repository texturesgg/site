import { env } from "cloudflare:workers";
import {
  claimCheckRun,
  codeModBuilds,
  codeModCheckRuns,
  codeModLayouts,
  codeModReleases,
  codeMods,
  codeModSetMods,
  codeModSets,
  createDb,
  games,
  users,
} from "@vgskins/db";
import { eq } from "drizzle-orm";
import { beforeAll, expect, it } from "vitest";
import { buildCommand } from "./builder";
import { insertRelease, layoutsToBuild, releasesToBuildFor } from "./release";

const db = createDb(env.DB);
const NOW = new Date();

beforeAll(async () => {
  await db.insert(users).values({
    id: "owner",
    name: "owner",
    email: "owner@example.com",
    createdAt: NOW,
    updatedAt: NOW,
  });
  await db.insert(games).values({
    id: "melee",
    name: "Super Smash Bros. Melee",
    slug: "melee",
    shortName: "Melee",
    createdAt: NOW,
    updatedAt: NOW,
  });
  for (const slug of ["me.core", "me.counter"]) {
    await db.insert(codeMods).values({
      id: slug,
      userId: "owner",
      gameId: "melee",
      slug,
      name: slug,
      sourceKind: "push",
      createdAt: NOW,
      updatedAt: NOW,
    });
  }
});

it("fails a release that depends on a mod the registry doesn't have", async () => {
  const release = await insertRelease(db, {
    codeModId: "me.counter",
    tag: "v1.0.0",
    commitSha: "0".repeat(40),
    manifest: {
      id: "me.counter",
      version: "1.0.0",
      license: null,
      depends: { "me.core": "^1.0", "me.missing": "*" },
      icon: null,
      screenshots: [],
      tags: [],
      homepage: null,
      refusal: null,
    },
  });
  expect(release.status).toBe("failed");
  const [row] = await db.select().from(codeModReleases).where(eq(codeModReleases.id, release.id));
  expect(row.error).toContain("me.missing");
  expect(row.error).not.toContain("me.core");
});

it("builds each mod's newest approved release for a new layout once", async () => {
  await db.insert(codeModLayouts).values(
    ["old", "new"].map((id) => ({
      id,
      api: "tgg-melee/0",
      port: "tgg-melee",
      target: "x86_64-linux-gnu",
      portVersion: id,
      createdAt: NOW,
    }))
  );
  const release = (id: string, codeModId: string, at: number) => ({
    id,
    codeModId,
    version: `1.${at}.0`,
    tag: id,
    commitSha: id,
    status: "approved" as const,
    createdAt: new Date(at),
    updatedAt: new Date(at),
  });
  await db
    .insert(codeModReleases)
    .values([
      release("core-1", "me.core", 1),
      release("core-2", "me.core", 2),
      release("counter-1", "me.counter", 1),
    ]);
  await db.insert(codeModBuilds).values([
    { id: "core-2-old", releaseId: "core-2", layoutId: "old", status: "succeeded", createdAt: NOW },
    // A package without a library already serves every layout.
    {
      id: "counter-1-every",
      releaseId: "counter-1",
      layoutId: null,
      status: "succeeded",
      createdAt: NOW,
    },
  ]);
  expect(await releasesToBuildFor(db, "new")).toEqual([
    { releaseId: "core-2", codeModId: "me.core", commitSha: "core-2" },
  ]);
  expect(await releasesToBuildFor(db, "old")).toEqual([]);
});

it("builds Linux and Windows layouts in the image, and leaves macOS out", async () => {
  await db.insert(codeModLayouts).values(
    [
      ["linux", "x86_64-linux-gnu", "image"],
      ["windows", "x86_64-windows-gnu", "image"],
      ["macos", "aarch64-apple-darwin", "external"],
    ].map(([id, target, builder]) => ({
      id,
      api: "tgg-melee/0",
      port: "tgg-melee",
      target,
      portVersion: "0.1.0-rc.8",
      builder: builder as "image" | "external",
      createdAt: NOW,
    }))
  );
  await db.update(codeModLayouts).set({ active: false }).where(eq(codeModLayouts.id, "old"));
  expect(await layoutsToBuild(db)).toEqual([
    { id: "linux", target: "x86_64-linux-gnu" },
    { id: "new", target: "x86_64-linux-gnu" },
    { id: "windows", target: "x86_64-windows-gnu" },
  ]);
  // A Windows build cross-compiles with MinGW, through the image's toolchain file.
  const windows = buildCommand("windows", "x86_64-windows-gnu");
  expect(windows.args).toEqual(expect.arrayContaining(["--cc", "x86_64-w64-mingw32-gcc"]));
  expect(windows.env.CMAKE_TOOLCHAIN_FILE).toBe("/opt/tgg/toolchains/x86_64-windows-gnu.cmake");
  expect(buildCommand("linux", "x86_64-linux-gnu").args).not.toContain("--cc");
});

it("a new layout builds an older release a set pins outside the newest", async () => {
  // me.core: 1.1.0 (core-1) and 1.2.0 (core-2) approved; a set takes ~1.1.
  await db.insert(codeModSets).values({
    name: "classic",
    title: "Classic",
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
  });
  await db
    .insert(codeModSetMods)
    .values({ setName: "classic", mod: "me.core", range: "~1.1", position: 0 });
  await db.insert(codeModLayouts).values({
    id: "pinned",
    api: "tgg-melee/0",
    port: "tgg-melee",
    target: "x86_64-linux-gnu",
    portVersion: "pinned",
    createdAt: NOW,
  });
  expect((await releasesToBuildFor(db, "pinned")).map((r) => r.releaseId).sort()).toEqual([
    "core-1",
    "core-2",
  ]);
  await db.delete(codeModSets).where(eq(codeModSets.name, "classic"));
});

it("a check run counts toward the author's day, failed and rejected releases too", async () => {
  const day = 24 * 60 * 60 * 1000;
  await db.insert(codeModCheckRuns).values([
    ...Array.from({ length: 9 }, (_, i) => ({
      id: `recent-${i}`,
      userId: "owner",
      releaseId: "core-1",
      createdAt: new Date(NOW.getTime() - day + 60_000),
    })),
    // A day old: no longer counts.
    { id: "stale", userId: "owner", releaseId: "core-1", createdAt: new Date(NOW.getTime() - day) },
  ]);
  await db
    .update(codeModReleases)
    .set({ status: "rejected" })
    .where(eq(codeModReleases.id, "core-1"));
  expect(await claimCheckRun(db, { id: "counter-1", runId: "run-10" }, NOW)).toBe(true);
  expect(await claimCheckRun(db, { id: "counter-1", runId: "run-11" }, NOW)).toBe(false);
  // A retried step finds the run it already took.
  expect(await claimCheckRun(db, { id: "counter-1", runId: "run-10" }, NOW)).toBe(true);
  expect(await claimCheckRun(db, { id: "counter-1", runId: "run-12", exempt: true }, NOW)).toBe(
    true
  );
  // Once the oldest runs age out, the author builds again.
  const later = new Date(NOW.getTime() + 120_000);
  expect(await claimCheckRun(db, { id: "counter-1", runId: "run-13" }, later)).toBe(true);
});
