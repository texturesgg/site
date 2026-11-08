import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import {
  codeModBuilds,
  codeModLayouts,
  codeModReleaseDependencies,
  codeModReleaseImages,
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

/** A request, once the work it leaves behind (counting a download) is done. */
async function get(path: string, init: RequestInit = {}) {
  const ctx = createExecutionContext();
  const response = await app.request(path, init, env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
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

// The store: listed mods, one mod's details, and their images.
describe("mods", () => {
  const ICON = new TextEncoder().encode("an icon's bytes");
  const SHOT = new TextEncoder().encode("a screenshot's bytes");
  let icon: string;
  let shot: string;

  beforeAll(async () => {
    [icon, shot] = await Promise.all([sha256Hex(ICON), sha256Hex(SHOT)]);
    await db
      .update(codeModReleases)
      .set({
        status: "approved",
        readme: "# UCF\n\nUniversal controller fix.",
        changelog: "- Dashback fix.",
        tags: ["competitive", "netplay"],
        homepage: "https://example.com/ucf",
        license: "MIT",
        publishedAt: NOW,
      })
      .where(eq(codeModReleases.id, "tgg.ucf@1.2.0"));
    await db.insert(codeModReleaseImages).values([
      {
        releaseId: "tgg.ucf@1.2.0",
        kind: "icon",
        position: 0,
        sha256: icon,
        width: 64,
        height: 64,
      },
      {
        releaseId: "tgg.ucf@1.2.0",
        kind: "screenshot",
        position: 0,
        sha256: shot,
        width: 640,
        height: 480,
      },
    ]);
    await env.CODE_MODS.put(`code-mods/images/${icon}.png`, ICON);
    await env.CODE_MODS.put(`code-mods/images/${shot}.png`, SHOT);
    await db
      .insert(codeModReleaseDependencies)
      .values({ releaseId: "tgg.ucf@1.2.0", dependency: "tgg.menu-art", range: "*" });
    await addMod("tgg.listed-pending", [{ version: "0.1.0", status: "pending", layout: LINUX }]);
    await db.insert(codeModReleaseImages).values({
      releaseId: "tgg.listed-pending@0.1.0",
      kind: "icon",
      position: 0,
      sha256: "f".repeat(64),
      width: 1,
      height: 1,
    });
    await putSet("competitive", {
      title: "Competitive",
      mods: [
        { id: "tgg.ucf", range: "^1.0" },
        { id: "tgg.menu-art", range: "*" },
      ],
    });
  });

  it("lists mods with approved releases, each by its newest one", async () => {
    const response = await get("/api/registry/mods");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=60");
    const page = (await response.json()) as {
      port: string;
      items: { id: string }[];
      total: number;
    };
    expect(page).toMatchObject({ port: "0.1.0-rc.8", page: 1, pageSize: 50, total: 2 });
    const ucf = page.items.find((mod) => mod.id === "tgg.ucf");
    expect(ucf).toEqual({
      id: "tgg.ucf",
      name: "tgg.ucf",
      description: null,
      author: "owner",
      publisher: { name: "owner", official: false },
      icon: { url: `http://localhost/api/registry/images/${icon}.png`, width: 64, height: 64 },
      tags: ["competitive", "netplay"],
      installs: expect.any(Number),
      version: "1.2.0",
      updatedAt: NOW.toISOString(),
      sets: ["competitive"],
      targets: ["linux"],
      netplay: "code",
    });
    // A package without a library is built for every system.
    expect(page.items.find((mod) => mod.id === "tgg.menu-art")).toMatchObject({
      icon: null,
      tags: [],
      targets: ["linux", "macos"],
      netplay: "data",
    });
  });

  it("lists official mods first, under the publisher name an admin set", async () => {
    const installsFirst = (await (await get("/api/registry/mods?sort=installs")).json()) as {
      items: { id: string }[];
    };
    const last = installsFirst.items[installsFirst.items.length - 1].id;
    await db
      .update(codeMods)
      .set({ official: true, publisherName: "textures.gg" })
      .where(eq(codeMods.slug, last));
    const page = (await (await get("/api/registry/mods")).json()) as {
      items: { id: string; author: string; publisher: unknown }[];
    };
    expect(page.items[0]).toMatchObject({
      id: last,
      author: "owner",
      publisher: { name: "textures.gg", official: true },
    });
    expect(
      (
        (await (await get("/api/registry/mods?sort=installs")).json()) as {
          items: { id: string }[];
        }
      ).items.map((mod) => mod.id)
    ).toEqual(installsFirst.items.map((mod) => mod.id));
    expect((await get(`/api/registry/mods/${last}`).then((r) => r.json())) as object).toMatchObject(
      {
        publisher: { name: "textures.gg", official: true },
      }
    );
    expect((await get("/api/registry/mods?sort=newest")).status).toBe(400);
    await db
      .update(codeMods)
      .set({ official: false, publisherName: null })
      .where(eq(codeMods.slug, last));
  });

  it("pages the list", async () => {
    const page = await (await get("/api/registry/mods?page=2&pageSize=1")).json();
    expect(page).toMatchObject({ page: 2, pageSize: 1, total: 2, totalPages: 2 });
    expect((page as { items: unknown[] }).items).toHaveLength(1);
  });

  it("details a mod with its README, screenshots, links, releases and dependencies", async () => {
    const response = await get("/api/registry/mods/tgg.ucf");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: "tgg.ucf",
      version: "1.2.0",
      port: "0.1.0-rc.8",
      readme: "# UCF\n\nUniversal controller fix.",
      screenshots: [
        { url: `http://localhost/api/registry/images/${shot}.png`, width: 640, height: 480 },
      ],
      homepage: "https://example.com/ucf",
      source: null,
      license: "MIT",
      releases: [
        { version: "1.2.0", date: NOW.toISOString(), changelog: "- Dashback fix." },
        { version: "1.1.0", changelog: null },
        { version: "1.0.0", changelog: null },
      ],
      depends: [{ id: "tgg.menu-art", range: "*" }],
    });
  });

  it("has no details for a mod without approved releases, or a deleted one", async () => {
    for (const id of ["tgg.listed-pending", "tgg.gone", "tgg.nothing"]) {
      expect((await get(`/api/registry/mods/${id}`)).status, id).toBe(404);
    }
  });

  it("serves a listed release's images, and no other", async () => {
    const response = await get(`/api/registry/images/${icon}.png`);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("Cache-Control")).toContain("immutable");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(ICON);
    expect((await get(`/api/registry/images/${"f".repeat(64)}.png`)).status).toBe(404);
    expect((await get("/api/registry/images/icon.png")).status).toBe(400);
  });

  it("counts a package download as an install", async () => {
    const installs = async () =>
      ((await (await get("/api/registry/mods/tgg.menu-art")).json()) as { installs: number })
        .installs;
    const before = await installs();
    const sha256 = await sha256Hex(new TextEncoder().encode("tgg.menu-art@0.1.0"));
    expect((await get(`/api/registry/packages/${sha256}.zip`)).status).toBe(200);
    expect(await installs()).toBe(before + 1);
  });
});

describe("slippi", () => {
  type Mapping = {
    format: number;
    snapshot: string;
    codes: {
      code: string;
      versions: string;
      stages?: number[];
      unless?: string[];
      id?: string;
      range?: string;
      game?: object;
    }[];
    minor: { code: string; name: string; versions: string }[];
    ignore: { code: string; name: string; versions: string }[];
  };
  async function mapping(): Promise<Mapping> {
    const response = await get("/api/registry/slippi");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=60");
    return response.json();
  }
  const declare = (
    release: string,
    slippi: { code: string; name: string; versions: string; unless?: string[] }[]
  ) => db.update(codeModReleases).set({ slippi }).where(eq(codeModReleases.id, release));
  const SPAWNS = { code: "0x8016E510", name: "Neutral Spawns", versions: "*" };

  it("maps each code a mod's newest approved release declares, with the releases that do", async () => {
    await addMod("tgg.spawns", [
      { version: "0.1.0", status: "approved", layout: LINUX },
      { version: "0.1.1", status: "approved", layout: LINUX },
      { version: "0.1.10", status: "approved", layout: LINUX },
      { version: "0.2.0", status: "pending", layout: LINUX },
    ]);
    await db.update(codeMods).set({ official: true }).where(eq(codeMods.id, "tgg.spawns"));
    await declare("tgg.spawns@0.1.1", [SPAWNS]);
    await declare("tgg.spawns@0.1.10", [
      SPAWNS,
      { code: "frozen-stadium", name: "", versions: "<3.18" },
    ]);
    await declare("tgg.spawns@0.2.0", [{ code: "0x80000000", name: "", versions: "*" }]);
    // Another mod claiming the same code comes after the official one, and a
    // deleted mod's codes aren't mapped.
    await addMod("me.spawns", [{ version: "1.0.0", status: "approved", layout: LINUX }]);
    await declare("me.spawns@1.0.0", [SPAWNS]);
    await addMod("me.deleted", [{ version: "1.0.0", status: "approved", layout: LINUX }]);
    await declare("me.deleted@1.0.0", [{ code: "0x80000004", name: "", versions: "*" }]);
    await db.update(codeMods).set({ deletedAt: NOW }).where(eq(codeMods.id, "me.deleted"));

    const { format, snapshot, codes, minor, ignore } = await mapping();
    expect(format).toBe(1);
    expect(snapshot).toMatch(/^[0-9a-f]{32}$/);
    const declared = codes.filter((entry) => entry.id);
    expect(declared).toEqual([
      { ...SPAWNS, id: "tgg.spawns", range: ">=0.1.1" },
      { ...SPAWNS, id: "me.spawns", range: ">=1.0.0" },
      { code: "frozen-stadium", name: "", versions: "<3.18", id: "tgg.spawns", range: ">=0.1.10" },
    ]);
    // The registry's stage-only codes come first.
    expect(codes[0]).toEqual(
      expect.objectContaining({ code: "0x800165AC", versions: ">=3.19", stages: [3] })
    );
    expect(codes.indexOf(declared[0])).toBeGreaterThan(0);
    expect(ignore).toContainEqual(expect.objectContaining({ code: "ucf-off" }));
    expect(ignore).toContainEqual(expect.objectContaining({ code: "0x801A4DE4", versions: "*" }));
    expect(minor).toContainEqual(expect.objectContaining({ code: "0x801239A8", versions: "*" }));
    expect([...codes, ...minor, ...ignore].every((entry) => !("why" in entry))).toBe(true);
    // A gameplay code that matters on one stage, which nothing reproduces yet.
    expect(codes).toContainEqual(
      expect.objectContaining({ code: "0x801C65C8", versions: ">=3.19", stages: [3] })
    );
  });

  it("maps a code only an older release declares to that release", async () => {
    await addMod("tgg.variants", [
      { version: "0.8.0", status: "approved", layout: LINUX },
      { version: "0.84.0", status: "approved", layout: LINUX },
    ]);
    const legacy = { code: "0x800908F4", name: "UCF 0.8", versions: ">=3.9" };
    await declare("tgg.variants@0.8.0", [{ ...legacy, unless: ["0x8006B460"] }]);
    await declare("tgg.variants@0.84.0", [{ code: "0x8006B460", name: "UCF 0.84", versions: "*" }]);
    const { codes } = await mapping();
    expect(codes.filter((entry) => entry.id === "tgg.variants")).toEqual([
      {
        code: "0x8006B460",
        name: "UCF 0.84",
        versions: "*",
        id: "tgg.variants",
        range: ">=0.84.0",
      },
      { ...legacy, unless: ["0x8006B460"], id: "tgg.variants", range: "0.8.0" },
    ]);
  });

  it("names a new state of the mapping with a new snapshot", async () => {
    const before = (await mapping()).snapshot;
    expect((await mapping()).snapshot).toBe(before);
    await db
      .update(codeModReleases)
      .set({ status: "approved" })
      .where(eq(codeModReleases.id, "tgg.spawns@0.2.0"));
    const after = await mapping();
    expect(after.snapshot).not.toBe(before);
    // 0.2.0 no longer declares the older codes: 0.1.10 still reproduces them.
    expect(after.codes.filter((entry) => entry.id === "tgg.spawns")).toEqual([
      { code: "0x80000000", name: "", versions: "*", id: "tgg.spawns", range: ">=0.2.0" },
      { ...SPAWNS, id: "tgg.spawns", range: "0.1.10" },
      { code: "frozen-stadium", name: "", versions: "<3.18", id: "tgg.spawns", range: "0.1.10" },
    ]);
  });
});
