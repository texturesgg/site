import { env } from "cloudflare:test";
import {
  codeModBuilds,
  codeModReleaseImages,
  codeModReleases,
  codeMods,
  codeModSetMods,
  codeModSets,
  createDb,
  games,
} from "@vgskins/db";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { signIn } from "../test/session";
import {
  getModShareData,
  getPublicSitemapData,
  getSetShareData,
  getShareIcon,
  parsePublicCatalogIdentifier,
} from "./public-catalog";

// A mod link's tags and share card, and the sitemap's mod and set pages, show
// only while code mods are on for people signed out: with the flag off, a
// link to a mod shows what it did before mods had cards.

const db = createDb(env.DB);
const NOW = new Date();
const ICON = "c".repeat(64);

function codeModsForEveryone(on: boolean) {
  vi.spyOn(env.FLAGS, "getBooleanValue").mockImplementation(async (_key, fallback, context) =>
    context?.role === "anonymous" ? on : fallback
  );
}

beforeAll(async () => {
  await signIn(db, "owner");
  await db.insert(games).values({
    id: "melee",
    name: "Super Smash Bros. Melee",
    slug: "melee",
    shortName: "Melee",
    createdAt: NOW,
    updatedAt: NOW,
  });
  await db.insert(codeMods).values({
    id: "ucf",
    userId: "owner",
    gameId: "melee",
    slug: "tgg.ucf",
    name: "UCF",
    description: "The Universal Controller Fix.",
    sourceKind: "push",
    publisherName: "textures.gg",
    official: true,
    createdAt: NOW,
    updatedAt: NOW,
  });
  await db.insert(codeModReleases).values({
    id: "ucf-1",
    codeModId: "ucf",
    version: "1.0.0",
    tag: "v1.0.0",
    commitSha: "0".repeat(40),
    status: "approved",
    kind: "script",
    publishedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
  });
  await db.insert(codeModBuilds).values({
    id: "ucf-1-build",
    releaseId: "ucf-1",
    layoutId: null,
    status: "succeeded",
    packageSha256: "a".repeat(64),
    packageSize: 10,
    netplay: "code",
    createdAt: NOW,
  });
  await db.insert(codeModReleaseImages).values({
    releaseId: "ucf-1",
    kind: "icon",
    position: 0,
    sha256: ICON,
    width: 256,
    height: 256,
  });
  await env.CODE_MODS.put(`code-mods/images/${ICON}.png`, new Uint8Array([137, 80, 78, 71]));
  await db.insert(codeModSets).values({
    name: "competitive",
    title: "Competitive",
    description: "",
    version: 5,
    createdAt: NOW,
    updatedAt: NOW,
  });
  await db
    .insert(codeModSetMods)
    .values({ setName: "competitive", mod: "tgg.ucf", range: "^1.0", position: 0 });
});

it("shows no mod, set, icon or sitemap entry while code mods are off for everyone", async () => {
  codeModsForEveryone(false);
  expect(await getModShareData(env, "tgg.ucf")).toBeNull();
  expect(await getSetShareData(env, "competitive")).toBeNull();
  expect(await getShareIcon(env, ICON)).toBeNull();
  const sitemap = await getPublicSitemapData(env);
  expect(sitemap.mods).toEqual([]);
  expect(sitemap.sets).toEqual([]);
});

it("describes a mod and a set for their cards once code mods are on for everyone", async () => {
  codeModsForEveryone(true);
  expect(await getModShareData(env, "tgg.ucf")).toEqual({
    id: "tgg.ucf",
    name: "UCF",
    description: "The Universal Controller Fix.",
    publisher: { name: "textures.gg", official: true },
    version: "1.0.0",
    kind: "script",
    netplay: "code",
    icon: ICON,
  });
  expect(await getSetShareData(env, "competitive")).toEqual({
    name: "competitive",
    title: "Competitive",
    description: "",
    version: 5,
    modCount: 1,
  });
  expect(await getShareIcon(env, ICON)).toEqual(new Uint8Array([137, 80, 78, 71]));
  const sitemap = await getPublicSitemapData(env);
  expect(sitemap.mods.map((mod) => mod.id)).toEqual(["tgg.ucf"]);
  expect(sitemap.sets).toEqual([{ name: "competitive" }]);
});

describe("public catalog RPC arguments", () => {
  it("accepts deployed catalog identifiers", () => {
    expect(parsePublicCatalogIdentifier("melee")).toBe("melee");
    expect(parsePublicCatalogIdentifier("pack-slug-123")).toBe("pack-slug-123");
  });

  it.each([undefined, null, 42, "", "x".repeat(201)])("rejects invalid identifiers", (value) => {
    expect(() => parsePublicCatalogIdentifier(value)).toThrow();
  });
});
