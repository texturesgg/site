import { env } from "cloudflare:workers";
import {
  codeModBuilds,
  codeModLayouts,
  codeModReleases,
  codeMods,
  createDb,
  games,
  users,
} from "@vgskins/db";
import { eq } from "drizzle-orm";
import { beforeAll, expect, it } from "vitest";
import { insertRelease, releasesToBuildFor } from "./release";

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
      refusal: null,
    },
  });
  expect(release.status).toBe("failed");
  const [row] = await db.select().from(codeModReleases).where(eq(codeModReleases.id, release.id));
  expect(row.error).toContain("me.missing");
  expect(row.error).not.toContain("me.core");
});

it("builds each mod's latest approved release for a new layout once", async () => {
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
    version: id,
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
