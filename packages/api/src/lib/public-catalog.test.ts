import { env } from "cloudflare:test";
import {
  codeModBuilds,
  codeModLayouts,
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
import { MOD_DOCS_MIRROR } from "./mod-docs-mirror";
import {
  getModDocsMeta,
  getModDocsRawFile,
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
  await db.insert(codeModLayouts).values({
    id: "1".repeat(16),
    api: "tgg-melee/1",
    port: "tgg-melee",
    target: "x86_64-linux-gnu",
    portVersion: "1.0.0",
    createdAt: NOW,
  });
  const docsMirror: Record<string, string> = {
    "1.0.0/docs/index.json": JSON.stringify({
      format: 2,
      version: "1.0.0",
      nav: [
        { title: "Start", pages: ["start/quickstart"] },
        { title: "Native C", advanced: true, pages: ["native/hooks"] },
      ],
      pages: {
        index: { title: "Making mods", label: "Overview", description: "Intro.", headings: [] },
        "start/quickstart": {
          title: "Your first mod",
          label: "Quickstart",
          description: "Five minutes.",
          headings: [],
        },
        "native/hooks": {
          title: "Hooks",
          description: "Game hooks.",
          headings: [],
        },
      },
      headers: ["tgg/mod.h"],
      redirects: { hooks: "native/hooks" },
    }),
    "1.0.0/docs/start/quickstart.md": "---\ntitle: Your first mod\n---\n\nHello.\n",
    "1.0.0/docs/native/hooks.md": "---\ntitle: Hooks\n---\n\nHook body.\n",
    "1.0.0/docs/llms.txt": "# tgg-melee mod docs\n",
    "1.0.0/docs/tgg.luau": "--!strict\nreturn {}\n",
  };
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input instanceof Request ? input.url : input);
    const prefix = `${MOD_DOCS_MIRROR}/`;
    const path = url.startsWith(prefix) ? decodeURIComponent(url.slice(prefix.length)) : "";
    const body = docsMirror[path];
    return body === undefined ? new Response("missing", { status: 404 }) : new Response(body);
  });
});

it("hides mods, sets, and icons while code mods are off, but keeps mod docs public", async () => {
  codeModsForEveryone(false);
  expect(await getModShareData(env, "tgg.ucf")).toBeNull();
  expect(await getSetShareData(env, "competitive")).toBeNull();
  expect(await getShareIcon(env, ICON)).toBeNull();
  expect(await getModDocsMeta(env, "latest", "start/quickstart")).toEqual({
    title: "Your first mod - Making mods - textures.gg",
    description: "Five minutes.",
    canonicalPath: "/docs/mods/latest/start/quickstart",
  });
  expect(await getModDocsRawFile(env, "latest", "llms.txt")).toMatchObject({
    contentType: "text/plain; charset=utf-8",
    body: "# tgg-melee mod docs\n",
  });
  const sitemap = await getPublicSitemapData(env);
  expect(sitemap.mods).toEqual([]);
  expect(sitemap.sets).toEqual([]);
  expect(sitemap.docs).toEqual(["index", "start/quickstart", "native/hooks"]);
});

it("describes mods, sets, and mod docs once code mods are on for everyone", async () => {
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
  expect(sitemap.docs).toEqual(["index", "start/quickstart", "native/hooks"]);

  expect(await getModDocsMeta(env, "1.0", "index")).toEqual({
    title: "Making mods - textures.gg",
    description: "Intro.",
    canonicalPath: "/docs/mods/latest",
  });
  expect(await getModDocsMeta(env, "1.0", "start/quickstart")).toEqual({
    title: "Your first mod - Making mods - textures.gg",
    description: "Five minutes.",
    canonicalPath: "/docs/mods/latest/start/quickstart",
  });
  expect(await getModDocsMeta(env, "1.0", "hooks")).toEqual({
    title: "Hooks - Making mods - textures.gg",
    description: "Game hooks.",
    canonicalPath: "/docs/mods/latest/native/hooks",
  });
  expect(await getModDocsMeta(env, "1.0", "api/mod")).toEqual({
    title: "mod.h - Making mods - textures.gg",
    description: "C SDK header tgg/mod.h for tgg-melee.",
    canonicalPath: "/docs/mods/latest/api/mod",
  });
  expect(await getModDocsMeta(env, "1.0", "guides/missing")).toBeNull();

  expect(await getModDocsRawFile(env, "latest", "llms.txt")).toMatchObject({
    contentType: "text/plain; charset=utf-8",
    body: "# tgg-melee mod docs\n",
  });
  expect(await getModDocsRawFile(env, "latest", "tgg.luau")).toMatchObject({
    contentType: "text/plain; charset=utf-8",
    body: "--!strict\nreturn {}\n",
  });
  expect(await getModDocsRawFile(env, "1.0", "start/quickstart.md")).toMatchObject({
    contentType: "text/markdown; charset=utf-8",
    body: "---\ntitle: Your first mod\n---\n\nHello.\n",
  });
  expect(await getModDocsRawFile(env, "1.0", "hooks.md")).toMatchObject({
    contentType: "text/markdown; charset=utf-8",
    body: "---\ntitle: Hooks\n---\n\nHook body.\n",
  });
  expect(await getModDocsRawFile(env, "1.0", "missing.md")).toBeNull();
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
