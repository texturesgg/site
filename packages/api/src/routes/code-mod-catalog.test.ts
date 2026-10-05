import { createExecutionContext, env } from "cloudflare:test";
import {
  codeModBuilds,
  codeModLayouts,
  codeModReleases,
  codeMods,
  createDb,
  games,
} from "@vgskins/db";
import { Hono } from "hono";
import { beforeAll, expect, it, vi } from "vitest";
import { signIn } from "../test/session";
import type { HonoEnv } from "../types";
import codeModsRoutes from "./code-mods";

const db = createDb(env.DB);
const app = new Hono<HonoEnv>().route("/api/code-mods", codeModsRoutes);
const NOW = new Date();
const LAYOUT = "0123456789abcdef";
let cookie: string;

beforeAll(async () => {
  vi.spyOn(env.FLAGS, "getBooleanValue").mockResolvedValue(true);
  cookie = await signIn(db, "player");
  await signIn(db, "owner");
  await db.insert(games).values({
    id: "melee",
    name: "Super Smash Bros. Melee",
    slug: "melee",
    shortName: "Melee",
    createdAt: NOW,
    updatedAt: NOW,
  });
  await db.insert(codeModLayouts).values({
    id: LAYOUT,
    api: "tgg-melee/0",
    port: "tgg-melee",
    target: "x86_64-linux-gnu",
    portVersion: "0.1.0",
    createdAt: NOW,
  });
  await db.insert(codeMods).values({
    id: "menu-art",
    userId: "owner",
    gameId: "melee",
    slug: "me.menu-art",
    name: "Menu art",
    sourceKind: "push",
    createdAt: NOW,
    updatedAt: NOW,
  });
  await db.insert(codeModReleases).values({
    id: "menu-art-1",
    codeModId: "menu-art",
    version: "1.0.0",
    tag: "v1.0.0",
    commitSha: "0".repeat(40),
    status: "approved",
    createdAt: NOW,
    updatedAt: NOW,
  });
  await db.insert(codeModBuilds).values({
    id: "menu-art-1-build",
    releaseId: "menu-art-1",
    layoutId: LAYOUT,
    status: "succeeded",
    packageSha256: "a".repeat(64),
    packageSize: 10,
    manifest: { api: "tgg-melee/0", id: "me.menu-art", name: "Menu art", version: "1.0.0" },
    netplay: "data",
    createdAt: NOW,
  });
});

it("says what each package counts as for netplay", async () => {
  const response = await app.request(
    `/api/code-mods/catalog/${LAYOUT}`,
    { headers: { cookie } },
    env,
    createExecutionContext()
  );
  expect(response.status).toBe(200);
  const catalog = (await response.json()) as { mods: Record<string, unknown>[] };
  expect(catalog.mods).toEqual([expect.objectContaining({ id: "me.menu-art", netplay: "data" })]);
});

it("shows a release as what its builds count as", async () => {
  const get = async (path: string) =>
    (await app.request(path, { headers: { cookie } }, env, createExecutionContext())).json();
  const mod = (await get("/api/code-mods/me.menu-art")) as { releases: { netplay: string }[] };
  expect(mod.releases.map((release) => release.netplay)).toEqual(["data"]);
  const list = (await get("/api/code-mods")) as { items: { latest: { netplay: string } }[] };
  expect(list.items.map((item) => item.latest.netplay)).toEqual(["data"]);
});

it("serves a package without a library to every layout", async () => {
  await db.insert(codeMods).values({
    id: "menu-sounds",
    userId: "owner",
    gameId: "melee",
    slug: "me.menu-sounds",
    name: "Menu sounds",
    sourceKind: "push",
    createdAt: NOW,
    updatedAt: NOW,
  });
  await db.insert(codeModReleases).values({
    id: "menu-sounds-1",
    codeModId: "menu-sounds",
    version: "1.0.0",
    tag: "v1.0.0",
    commitSha: "1".repeat(40),
    status: "approved",
    createdAt: NOW,
    updatedAt: NOW,
  });
  await db.insert(codeModBuilds).values({
    id: "menu-sounds-1-build",
    releaseId: "menu-sounds-1",
    layoutId: null,
    status: "succeeded",
    packageSha256: "b".repeat(64),
    packageSize: 10,
    manifest: { api: "tgg-melee/0", id: "me.menu-sounds", name: "Menu sounds", version: "1.0.0" },
    netplay: "data",
    createdAt: NOW,
  });
  const response = await app.request(
    "/api/code-mods/catalog/fedcba9876543210",
    { headers: { cookie } },
    env,
    createExecutionContext()
  );
  const catalog = (await response.json()) as { mods: { id: string }[] };
  expect(catalog.mods.map((mod) => mod.id)).toEqual(["me.menu-sounds"]);
});
