import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
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
import { z } from "zod";
import { signIn } from "../test/session";
import type { HonoEnv } from "../types";
import adminRoutes from "./admin";
import registryRoutes from "./registry";

// Pulling a release: a moderator withdraws it (or a whole mod), it leaves the
// catalog and its packages stop downloading, and the catalog's `withdrawn`
// list carries its hashes for tgg to act on installed copies. Restoring
// undoes it.
const db = createDb(env.DB);
const app = new Hono<HonoEnv>()
  .route("/api/registry", registryRoutes)
  .route("/api/admin", adminRoutes);
const NOW = new Date();
const LINUX = "1111111111111111";
const WINDOWS = "2222222222222222";
let moderator: string;
let player: string;

const Catalog = z.object({
  mods: z.array(z.object({ id: z.string(), version: z.string() })),
  ids: z.array(z.string()),
  snapshot: z.string(),
  withdrawn: z.array(
    z.object({
      id: z.string(),
      version: z.string(),
      reason: z.string(),
      mode: z.enum(["off", "warn"]),
      sha256: z.array(z.string()),
    })
  ),
});

async function request(path: string, init: RequestInit = {}) {
  const ctx = createExecutionContext();
  const response = await app.request(path, init, env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

function post(path: string, body: unknown, cookie = moderator) {
  return request(path, {
    method: "POST",
    headers: { cookie, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function catalog(layout = LINUX) {
  return Catalog.parse(await (await request(`/api/registry/catalog?layout=${layout}`)).json());
}

const hash = (seed: string) => seed.repeat(64).slice(0, 64);

beforeAll(async () => {
  vi.spyOn(env.FLAGS, "getBooleanValue").mockResolvedValue(true);
  moderator = await signIn(db, "moderator", "moderator");
  player = await signIn(db, "player");
  await signIn(db, "maker");
  await db.insert(games).values({
    id: "melee",
    name: "Super Smash Bros. Melee",
    slug: "melee",
    shortName: "Melee",
    createdAt: NOW,
    updatedAt: NOW,
  });
  for (const [id, target] of [
    [LINUX, "x86_64-linux-gnu"],
    [WINDOWS, "x86_64-windows-gnu"],
  ]) {
    await db.insert(codeModLayouts).values({
      id,
      api: "tgg-melee/0",
      port: "tgg-melee",
      target,
      portVersion: "0.1.0",
      createdAt: NOW,
    });
  }
  await db.insert(codeMods).values({
    id: "mod",
    userId: "maker",
    gameId: "melee",
    slug: "me.mod",
    name: "A mod",
    sourceKind: "push",
    createdAt: NOW,
    updatedAt: NOW,
  });
  for (const [n, version] of [
    [1, "1.0.0"],
    [2, "1.1.0"],
  ] as const) {
    await db.insert(codeModReleases).values({
      id: `r${n}`,
      codeModId: "mod",
      version,
      tag: `v${version}`,
      commitSha: String(n).repeat(40),
      status: "approved",
      createdAt: NOW,
      updatedAt: NOW,
    });
    for (const [layout, seed] of [
      [LINUX, `${n}a`],
      [WINDOWS, `${n}b`],
    ]) {
      await db.insert(codeModBuilds).values({
        id: `r${n}-${layout}`,
        releaseId: `r${n}`,
        layoutId: layout,
        status: "succeeded",
        packageSha256: hash(seed),
        packageKey: `code-mods/packages/${hash(seed)}.zip`,
        packageSize: 3,
        manifest: { api: "tgg-melee/0", id: "me.mod", name: "A mod", version },
        netplay: "code",
        createdAt: NOW,
      });
      await env.CODE_MODS.put(`code-mods/packages/${hash(seed)}.zip`, "zip");
    }
  }
});

it("withdraws a release: out of the catalog, its packages gone, its hashes listed", async () => {
  const before = await catalog();
  expect(before.withdrawn).toEqual([]);

  const response = await post("/api/admin/code-mods/releases/r2/withdraw", {
    reason: "it crashes on stage select",
  });
  expect(response.status).toBe(200);

  const after = await catalog();
  expect(after.mods.map((mod) => mod.version)).toEqual(["1.0.0"]);
  expect(after.snapshot).not.toBe(before.snapshot);
  expect(after.withdrawn).toEqual([
    {
      id: "me.mod",
      version: "1.1.0",
      reason: "it crashes on stage select",
      mode: "off",
      // Every layout's package, so a copy from another port is caught too.
      sha256: [hash("2a"), hash("2b")],
    },
  ]);
  expect((await request(`/api/registry/packages/${hash("2a")}.zip`)).status).toBe(404);
  expect((await request(`/api/registry/packages/${hash("1a")}.zip`)).status).toBe(200);

  // Only an approved release is withdrawn, once.
  expect(
    (await post("/api/admin/code-mods/releases/r2/withdraw", { reason: "again" })).status
  ).toBe(409);
});

it("restores a withdrawn release", async () => {
  expect((await post("/api/admin/code-mods/releases/r2/restore", {})).status).toBe(200);
  const after = await catalog();
  expect(after.mods.map((mod) => mod.version)).toEqual(["1.1.0", "1.0.0"]);
  expect(after.withdrawn).toEqual([]);
  expect((await request(`/api/registry/packages/${hash("2a")}.zip`)).status).toBe(200);
  expect((await post("/api/admin/code-mods/releases/r2/restore", {})).status).toBe(409);
});

it("needs a moderator and a reason, and takes warn", async () => {
  expect(
    (await post("/api/admin/code-mods/releases/r1/withdraw", { reason: "x" }, player)).status
  ).toBe(403);
  expect((await post("/api/admin/code-mods/releases/r1/withdraw", { reason: " " })).status).toBe(
    400
  );
  expect(
    (await post("/api/admin/code-mods/releases/r1/withdraw", { reason: "x", mode: "delete" }))
      .status
  ).toBe(400);
  expect(
    (
      await post("/api/admin/code-mods/releases/r1/withdraw", {
        reason: "slow menus",
        mode: "warn",
      })
    ).status
  ).toBe(200);
  expect((await catalog()).withdrawn).toEqual([
    expect.objectContaining({ version: "1.0.0", mode: "warn", reason: "slow menus" }),
  ]);
});

it("withdraws a whole mod and restores only what that took", async () => {
  // 1.0.0 is already withdrawn on its own; withdrawing the mod takes 1.1.0.
  const response = await post("/api/admin/code-mods/mod/withdraw", { reason: "steals tokens" });
  expect(response.status).toBe(200);
  const withdrawn = await catalog();
  expect(withdrawn.mods).toEqual([]);
  expect(withdrawn.ids).toEqual([]);
  expect(withdrawn.withdrawn.map((entry) => [entry.version, entry.reason])).toEqual([
    ["1.1.0", "steals tokens"],
    ["1.0.0", "slow menus"],
  ]);
  // A mod with no approved release is off every list.
  expect((await request("/api/registry/mods/me.mod")).status).toBe(404);

  expect((await post("/api/admin/code-mods/mod/restore", {})).status).toBe(200);
  const restored = await catalog();
  expect(restored.mods.map((mod) => mod.version)).toEqual(["1.1.0"]);
  expect(restored.withdrawn.map((entry) => entry.version)).toEqual(["1.0.0"]);
});
