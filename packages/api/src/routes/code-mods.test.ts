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
import adminRoutes from "./admin";
import codeModsRoutes from "./code-mods";

// Mod pages are public: anyone reads a mod and its approved releases, with
// the flag off and signed out, while its owner and moderators see every
// release and why a moderator rejected one. Creating and publishing stay
// behind the flag.
const db = createDb(env.DB);
const app = new Hono<HonoEnv>()
  .route("/api/code-mods", codeModsRoutes)
  .route("/api/admin", adminRoutes);
const NOW = new Date();
const LAYOUT = "0123456789abcdef";
let owner: string;
let stranger: string;
let moderator: string;

function request(path: string, init: RequestInit = {}) {
  return app.request(`/api/code-mods${path}`, init, env, createExecutionContext());
}

type ModPage = {
  id: string;
  releases: {
    version: string;
    rejectionReason: string | null;
    builds: { layoutId: string | null; layout: unknown }[];
  }[];
};

beforeAll(async () => {
  vi.spyOn(env.FLAGS, "getBooleanValue").mockResolvedValue(false);
  owner = await signIn(db, "owner");
  stranger = await signIn(db, "stranger");
  moderator = await signIn(db, "moderator", "moderator");
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
    id: "mod-internal-id",
    userId: "owner",
    gameId: "melee",
    slug: "me.mod",
    name: "Mod",
    sourceKind: "push",
    createdAt: NOW,
    updatedAt: NOW,
  });
  for (const [version, status] of [
    ["1.0.0", "approved"],
    ["1.1.0", "pending"],
  ] as const) {
    await db.insert(codeModReleases).values({
      id: version,
      codeModId: "mod-internal-id",
      version,
      tag: `v${version}`,
      commitSha: "0".repeat(40),
      status,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.insert(codeModBuilds).values({
      id: `${version}-build`,
      releaseId: version,
      layoutId: LAYOUT,
      status: "succeeded",
      logKey: `code-mods/logs/${version}.log`,
      createdAt: NOW,
    });
    await env.CODE_MODS.put(`code-mods/logs/${version}.log`, `log of ${version}`);
  }
});

it("anyone reads a mod and its approved releases, with the flag off", async () => {
  const list = await request("");
  expect(list.status).toBe(200);
  expect(((await list.json()) as { items: { slug: string }[] }).items).toMatchObject([
    { slug: "me.mod", latest: { version: "1.0.0" } },
  ]);

  for (const cookie of [undefined, stranger]) {
    const response = await request("/me.mod", { headers: cookie ? { cookie } : {} });
    expect(response.status).toBe(200);
    const page = (await response.json()) as ModPage;
    expect(page.id).toBe("mod-internal-id");
    expect(page.releases.map((release) => release.version)).toEqual(["1.0.0"]);
  }
  expect((await request("/builds/1.0.0-build/log")).status).toBe(200);
  expect((await request("/builds/1.1.0-build/log")).status).toBe(404);

  const mine = (await (await request("/me.mod", { headers: { cookie: owner } })).json()) as ModPage;
  expect(mine.releases.map((release) => release.version).sort()).toEqual(["1.0.0", "1.1.0"]);

  // Publishing stays behind the flag.
  expect(
    (await request("/me.mod/push-token", { method: "POST", headers: { cookie: owner } })).status
  ).toBe(404);
});

it("labels each build with its layout's system and port version", async () => {
  const page = (await (await request("/me.mod")).json()) as ModPage;
  expect(page.releases[0].builds).toMatchObject([
    {
      layoutId: LAYOUT,
      layout: {
        id: LAYOUT,
        target: "x86_64-linux-gnu",
        system: "linux",
        portVersion: "0.1.0",
        active: true,
      },
    },
  ]);
});

it("shows a reject's reason to the mod's owner and moderators only", async () => {
  await db.insert(codeModReleases).values({
    id: "1.2.0",
    codeModId: "mod-internal-id",
    version: "1.2.0",
    tag: "v1.2.0",
    commitSha: "0".repeat(40),
    status: "pending",
    createdAt: NOW,
    updatedAt: NOW,
  });
  const flags = vi.spyOn(env.FLAGS, "getBooleanValue").mockResolvedValue(true);
  const reject = (reason: string) =>
    app.request(
      "/api/admin/code-mods/releases/1.2.0/reject",
      {
        method: "POST",
        headers: { cookie: moderator, "content-type": "application/json" },
        body: JSON.stringify({ reason }),
      },
      env,
      createExecutionContext()
    );
  expect((await reject("x".repeat(1001))).status).toBe(400);
  expect((await reject("  Hooks a function it doesn't need.  ")).status).toBe(200);
  flags.mockResolvedValue(false);

  const reasonFor = async (cookie: string) => {
    const page = (await (await request("/me.mod", { headers: { cookie } })).json()) as ModPage;
    return page.releases.find((release) => release.version === "1.2.0")?.rejectionReason;
  };
  expect(await reasonFor(owner)).toBe("Hooks a function it doesn't need.");
  expect(await reasonFor(moderator)).toBe("Hooks a function it doesn't need.");
  expect(await reasonFor(stranger)).toBeUndefined();
});
