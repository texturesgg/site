import { env } from "cloudflare:test";
import {
  codeModBuilds,
  codeModLayouts,
  codeModReleases,
  codeMods,
  createDb,
  games,
} from "@vgskins/db";
import { beforeAll, describe, expect, it } from "vitest";
import { signIn } from "../test/session";
import { loadCodeMod, loadCodeModBuild, visibleCodeMods } from "./queries";

const db = createDb(env.DB);
const NOW = new Date();
const owner = { id: "owner", role: "user" };
const moderator = { id: "moderator", role: "moderator" };
const stranger = { id: "stranger", role: "user" };

beforeAll(async () => {
  await signIn(db, "owner");
  await signIn(db, "moderator", "moderator");
  await signIn(db, "stranger");
  await db.insert(games).values({
    id: "melee",
    name: "Super Smash Bros. Melee",
    slug: "melee",
    shortName: "Melee",
    createdAt: NOW,
    updatedAt: NOW,
  });
  await db.insert(codeModLayouts).values({
    id: "0123456789abcdef",
    api: "tgg-melee/0",
    port: "tgg-melee",
    target: "x86_64-linux-gnu",
    portVersion: "test",
    createdAt: NOW,
  });
  // One mod with only a release waiting for review, one with an approved one.
  for (const [id, status] of [
    ["unreleased", "pending"],
    ["released", "approved"],
  ] as const) {
    await db.insert(codeMods).values({
      id,
      userId: "owner",
      gameId: "melee",
      slug: `test.${id}`,
      name: id,
      sourceKind: "push",
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.insert(codeModReleases).values({
      id: `${id}-release`,
      codeModId: id,
      version: "1.0.0",
      tag: "v1.0.0",
      commitSha: "0".repeat(40),
      netplay: "gameplay",
      status,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.insert(codeModBuilds).values({
      id: `${id}-build`,
      releaseId: `${id}-release`,
      layoutId: "0123456789abcdef",
      status: "succeeded",
      packageSha256: id === "released" ? "a".repeat(64) : "b".repeat(64),
      createdAt: NOW,
    });
  }
});

describe("code mod visibility", () => {
  it("shows a mod without an approved release only to its owner and moderators", async () => {
    expect(await loadCodeMod(db, "test.unreleased", { requester: owner })).toBeDefined();
    expect(await loadCodeMod(db, "test.unreleased", { requester: moderator })).toBeDefined();
    expect(await loadCodeMod(db, "test.unreleased", { requester: stranger })).toBeUndefined();
    expect(await loadCodeMod(db, "test.unreleased", { requester: null })).toBeUndefined();
    expect(await loadCodeMod(db, "test.released", { requester: null })).toBeDefined();
  });

  it("lists the same mods it loads", async () => {
    const slugs = async (requester: typeof owner | null) =>
      (
        await db
          .select({ slug: codeMods.slug })
          .from(codeMods)
          .where(visibleCodeMods(db, requester))
      )
        .map((row) => row.slug)
        .sort();
    expect(await slugs(null)).toEqual(["test.released"]);
    expect(await slugs(stranger)).toEqual(["test.released"]);
    expect(await slugs(owner)).toEqual(["test.released", "test.unreleased"]);
  });

  it("hides an unapproved release's builds and packages from everyone else", async () => {
    expect(
      await loadCodeModBuild(db, { id: "unreleased-build" }, { requester: stranger })
    ).toBeUndefined();
    expect(
      await loadCodeModBuild(db, { packageSha256: "b".repeat(64) }, { requester: null })
    ).toBeUndefined();
    expect(
      await loadCodeModBuild(db, { id: "unreleased-build" }, { requester: owner })
    ).toBeDefined();
    expect(
      await loadCodeModBuild(db, { packageSha256: "a".repeat(64) }, { requester: null })
    ).toBeDefined();
  });
});
