import { createExecutionContext, env } from "cloudflare:test";
import {
  codeModBuilds,
  codeModLayouts,
  codeModReleases,
  codeMods,
  createDb,
  games,
} from "@vgskins/db";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { signIn } from "../test/session";
import type { HonoEnv } from "../types";
import adminRoutes from "./admin";
import registryRoutes from "./registry";

// The registry tgg-mod reads (core crates/tgg-mod/src/registry.rs): public
// sets and per-layout catalogs whose package URLs serve exactly the bytes
// the catalog's sha256 and size describe.
const db = createDb(env.DB);
const app = new Hono<HonoEnv>()
  .route("/api/registry", registryRoutes)
  .route("/api/admin", adminRoutes);
const NOW = new Date();
const LINUX = "0e0f5fc0c5ae03a4";
const MACOS = "ad84c5deee64d787";
const PACKAGE = new TextEncoder().encode("a package's bytes");
let admin: string;
let player: string;

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function get(path: string, init: RequestInit = {}) {
  return app.request(path, init, env, createExecutionContext());
}

function putSet(name: string, body: unknown, cookie = admin) {
  return get(`/api/admin/code-mods/sets/${name}`, {
    method: "PUT",
    headers: { cookie, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** A mod with releases, each approved or not and built for a layout (null: every layout). */
async function addMod(
  slug: string,
  releases: { version: string; status: "approved" | "pending"; layout: string | null }[]
) {
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
  for (const [i, release] of releases.entries()) {
    const id = `${slug}@${release.version}`;
    await db.insert(codeModReleases).values({
      id,
      codeModId: slug,
      version: release.version,
      tag: release.version,
      commitSha: String(i).repeat(40),
      status: release.status,
      createdAt: new Date(NOW.getTime() + i),
      updatedAt: NOW,
    });
    const bytes = new TextEncoder().encode(id);
    const sha256 = await sha256Hex(bytes);
    await db.insert(codeModBuilds).values({
      id: `${id}-build`,
      releaseId: id,
      layoutId: release.layout,
      status: "succeeded",
      packageKey: `code-mods/packages/${sha256}.zip`,
      packageSha256: sha256,
      packageSize: bytes.length,
      manifest: {
        api: "tgg-melee/0",
        id: slug,
        name: slug,
        version: release.version,
        ...(release.layout ? { entry: "mod.so", game_abi: release.layout } : {}),
      },
      netplay: release.layout ? "code" : "data",
      createdAt: NOW,
    });
    await env.CODE_MODS.put(`code-mods/packages/${sha256}.zip`, bytes);
  }
}

type Catalog = {
  schema: number;
  snapshot: string;
  ids: string[];
  mods: {
    id: string;
    version: string;
    netplay: string;
    package: { url: string; sha256: string; size: number };
  }[];
};

async function catalog(layout: string): Promise<Catalog> {
  const response = await get(`/api/registry/catalog?layout=${layout}`);
  expect(response.status).toBe(200);
  return response.json();
}

beforeAll(async () => {
  vi.spyOn(env.FLAGS, "getBooleanValue").mockResolvedValue(true);
  admin = await signIn(db, "admin", "admin");
  player = await signIn(db, "player");
  await signIn(db, "owner");
  await db.insert(games).values({
    id: "melee",
    name: "Super Smash Bros. Melee",
    slug: "melee",
    shortName: "Melee",
    createdAt: NOW,
    updatedAt: NOW,
  });
  for (const [id, target, builder] of [
    [LINUX, "x86_64-linux-gnu", "image"],
    [MACOS, "aarch64-apple-darwin", "external"],
  ] as const) {
    await db.insert(codeModLayouts).values({
      id,
      api: "tgg-melee/0",
      port: "tgg-melee",
      target,
      portVersion: "0.1.0-rc.8",
      builder,
      createdAt: NOW,
    });
  }
  await addMod("tgg.ucf", [
    { version: "1.0.0", status: "approved", layout: LINUX },
    { version: "1.1.0", status: "approved", layout: LINUX },
    { version: "1.2.0", status: "pending", layout: LINUX },
  ]);
  await addMod("tgg.menu-art", [{ version: "0.1.0", status: "approved", layout: null }]);
});

describe("catalog", () => {
  it("lists every approved release built for the layout, newest first", async () => {
    const { schema, snapshot, mods } = await catalog(LINUX);
    expect(schema).toBe(1);
    expect(snapshot).toMatch(/^[0-9a-f]{32}$/);
    expect(mods.map((mod) => `${mod.id} ${mod.version} ${mod.netplay}`)).toEqual([
      "tgg.menu-art 0.1.0 data",
      "tgg.ucf 1.1.0 code",
      "tgg.ucf 1.0.0 code",
    ]);
  });

  it("gives a known layout without builds the packages without a library", async () => {
    const { mods } = await catalog(MACOS);
    expect(mods.map((mod) => mod.id)).toEqual(["tgg.menu-art"]);
  });

  it("names every mod with an approved release, built for the layout or not", async () => {
    await addMod("tgg.draft", [{ version: "0.1.0", status: "pending", layout: LINUX }]);
    await addMod("tgg.gone", [{ version: "0.1.0", status: "approved", layout: LINUX }]);
    await db.update(codeMods).set({ deletedAt: NOW }).where(eq(codeMods.id, "tgg.gone"));
    const macos = await catalog(MACOS);
    expect(macos.mods.map((mod) => mod.id)).toEqual(["tgg.menu-art"]);
    expect(macos.ids).toEqual(["tgg.menu-art", "tgg.ucf"]);
    expect((await catalog(LINUX)).ids).toEqual(["tgg.menu-art", "tgg.ucf"]);
  });

  it("has no mods for an unknown layout", async () => {
    const { mods } = await catalog("ffffffffffffffff");
    expect(mods).toEqual([]);
  });

  it("serves each package's exact bytes at its content-addressed URL", async () => {
    const { mods } = await catalog(LINUX);
    for (const mod of mods) {
      const url = new URL(mod.package.url);
      expect(url.pathname).toBe(`/api/registry/packages/${mod.package.sha256}.zip`);
      const response = await get(url.pathname);
      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toContain("immutable");
      const bytes = new Uint8Array(await response.arrayBuffer());
      expect(bytes.length).toBe(mod.package.size);
      expect(await sha256Hex(bytes)).toBe(mod.package.sha256);
    }
  });

  it("doesn't serve a package of an unapproved release", async () => {
    const pending = await sha256Hex(new TextEncoder().encode("tgg.ucf@1.2.0"));
    expect((await get(`/api/registry/packages/${pending}.zip`)).status).toBe(404);
    expect((await get(`/api/registry/packages/${await sha256Hex(PACKAGE)}.zip`)).status).toBe(404);
  });

  it("names a new state of the catalog with a new snapshot", async () => {
    const before = (await catalog(LINUX)).snapshot;
    expect((await catalog(LINUX)).snapshot).toBe(before);
    await db
      .update(codeModReleases)
      .set({ status: "approved" })
      .where(eq(codeModReleases.id, "tgg.ucf@1.2.0"));
    const after = await catalog(LINUX);
    expect(after.snapshot).not.toBe(before);
    expect(after.mods.map((mod) => mod.version)).toContain("1.2.0");
  });
});

describe("sets", () => {
  it("lets admins create and edit sets, bumping the version when the mods change", async () => {
    const created = await putSet("competitive", {
      title: "Competitive",
      description: "Slippi-style setup",
      mods: [
        { id: "tgg.ucf", range: "^1.0" },
        { id: "tgg.menu-art", range: "*" },
      ],
    });
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({ name: "competitive", version: 1 });

    // A new title, and the same mods in another order: same version.
    const retitled = await putSet("competitive", {
      title: "Competitive rules",
      mods: [
        { id: "tgg.menu-art", range: "*" },
        { id: "tgg.ucf", range: "^1.0" },
      ],
    });
    expect(retitled.status).toBe(200);
    expect(await retitled.json()).toMatchObject({ version: 1 });

    const narrowed = await putSet("competitive", {
      title: "Competitive rules",
      mods: [
        { id: "tgg.menu-art", range: "*" },
        { id: "tgg.ucf", range: "~1.1" },
      ],
    });
    expect(await narrowed.json()).toMatchObject({ version: 2 });

    const response = await get("/api/registry/sets");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      {
        name: "competitive",
        title: "Competitive rules",
        description: "",
        version: 2,
        mods: [
          { id: "tgg.menu-art", range: "*" },
          { id: "tgg.ucf", range: "~1.1" },
        ],
      },
    ]);
  });

  it("refuses mods the registry doesn't have and ranges the game can't read", async () => {
    const unknown = await putSet("replays", {
      title: "Replays",
      mods: [{ id: "tgg.replay-player", range: "*" }],
    });
    expect(unknown.status).toBe(400);
    expect(await unknown.json()).toEqual({ error: "Not in the registry: tgg.replay-player" });

    for (const range of ["1.x", "^", "=1.2", "1.2.3.4", ""]) {
      const response = await putSet("replays", {
        title: "Replays",
        mods: [{ id: "tgg.ucf", range }],
      });
      expect(response.status, range).toBe(400);
    }
  });

  it("leaves sets to admins", async () => {
    const response = await putSet("mine", { title: "Mine", mods: [] }, player);
    expect(response.status).toBe(403);
  });
});
