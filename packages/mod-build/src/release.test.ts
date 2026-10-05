import { env } from "cloudflare:workers";
import { codeModReleases, codeMods, createDb, games, users } from "@vgskins/db";
import { eq } from "drizzle-orm";
import { beforeAll, expect, it } from "vitest";
import { insertRelease } from "./release";

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
