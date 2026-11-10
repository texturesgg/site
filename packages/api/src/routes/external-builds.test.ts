import { createExecutionContext, env } from "cloudflare:test";
import {
  codeModBuilds,
  codeModLayouts,
  codeModReleases,
  codeMods,
  codeModSetMods,
  codeModSets,
  createDb,
  games,
} from "@vgskins/db";
import { and, eq } from "drizzle-orm";
import { zipSync } from "fflate";
import { Hono } from "hono";
import { beforeAll, describe, expect, it } from "vitest";
import { signIn } from "../test/session";
import type { HonoEnv } from "../types";
import externalBuildsRoutes from "./external-builds";
import registryRoutes from "./registry";

// A Mac builds macOS layouts (builder `external`) once a release is approved:
// it lists what's missing, builds it, and uploads the package, which the
// Worker checks against the release and layout before the catalog lists it.
const db = createDb(env.DB);
const app = new Hono<HonoEnv>()
  .route("/api/external-builds", externalBuildsRoutes)
  .route("/api/registry", registryRoutes);
const NOW = new Date();
const LINUX = "0e0f5fc0c5ae03a4";
const MACOS = "ad84c5deee64d787";
const TARGET = "aarch64-apple-darwin";
const TOKEN = "external-builder-test-token";
const auth = { authorization: `Bearer ${TOKEN}` };

function request(path: string, init: RequestInit = {}, bindings: object = env) {
  return app.request(path, init, bindings, createExecutionContext());
}

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** A mod with one release; `built` lists its builds' layouts (null: every layout). */
async function addRelease(
  slug: string,
  version: string,
  status: "approved" | "pending",
  built: (string | null)[] = [LINUX],
  createdAt = NOW
) {
  if (!(await db.select().from(codeMods).where(eq(codeMods.id, slug))).length) {
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
  const id = `${slug.replaceAll(".", "_")}-${version.replaceAll(".", "_")}`;
  await db.insert(codeModReleases).values({
    id,
    codeModId: slug,
    version,
    tag: version,
    commitSha: "0".repeat(40),
    status,
    createdAt,
    updatedAt: NOW,
  });
  for (const layout of built) {
    await db.insert(codeModBuilds).values({
      id: `${id}-${layout ?? "every"}`,
      releaseId: id,
      layoutId: layout,
      status: "succeeded",
      createdAt: NOW,
    });
  }
  return id;
}

/** A package as `tgg mod build` makes it for the macOS layout, and its --json report. */
async function macPackage(slug: string, version: string, change: Record<string, unknown> = {}) {
  const manifest = {
    api: "tgg-melee/0",
    id: slug,
    name: slug,
    version,
    entry: "mod.so",
    game_abi: MACOS,
    target: TARGET,
    hooks: { before: [], after: ["Stage_Init"], replaces: [] },
    ...change,
  };
  const zip = zipSync({
    "manifest.json": new TextEncoder().encode(JSON.stringify(manifest)),
    "mod.so": new Uint8Array([0xcf, 0xfa, 0xed, 0xfe, 1, 2, 3]),
  });
  const report = {
    path: "/tmp/package.zip",
    sha256: await sha256Hex(zip),
    size: zip.length,
    manifest,
    canonical_hooks: { before: [], after: ["Stage_Init"], replaces: [] },
    netplay: "code",
  };
  return { zip, report };
}

function upload(release: string, fields: Record<string, string | Blob>, layout = MACOS) {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.append(name, value);
  return request(`/api/external-builds/releases/${release}/builds/${layout}`, {
    method: "PUT",
    headers: auth,
    body: form,
  });
}

async function succeeded(release: string, zip: Uint8Array, report: object) {
  return upload(release, {
    status: "succeeded",
    builder: "macos-15 arm64, gcc-15 15.2.0, tgg 0.4.0",
    run: "https://github.com/texturesgg/site/actions/runs/1",
    log: new Blob(["built"]),
    report: new Blob([JSON.stringify(report)]),
    package: new Blob([new Uint8Array(zip)]),
  });
}

type Pending = {
  layouts: {
    id: string;
    portVersion: string;
    releases: { id: string; mod: string; version: string }[];
  }[];
};

async function pending(query = ""): Promise<Pending> {
  const response = await request(`/api/external-builds/pending?target=${TARGET}${query}`, {
    headers: auth,
  });
  expect(response.status).toBe(200);
  return response.json();
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
  for (const [id, target, builder] of [
    [LINUX, "x86_64-linux-gnu", "image"],
    [MACOS, TARGET, "external"],
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
});

describe("the builder token", () => {
  it("is required, and the routes are off without one", async () => {
    const path = `/api/external-builds/pending?target=${TARGET}`;
    expect((await request(path)).status).toBe(401);
    expect((await request(path, { headers: { authorization: "Bearer wrong" } })).status).toBe(401);
    expect((await request(path, { headers: { authorization: TOKEN } })).status).toBe(401);
    expect(
      (await request(path, { headers: auth }, { ...env, MOD_BUILDER_TOKEN: undefined })).status
    ).toBe(404);
    expect((await request(path, { headers: auth })).status).toBe(200);
  });
});

describe("pending builds", () => {
  it("lists each mod's newest approved release with a library and no macOS build", async () => {
    // Recorded after 1.1.0, but older by version: never built.
    await addRelease("tgg.lister", "1.0.0", "approved", [LINUX], new Date(NOW.getTime() + 1000));
    const newer = await addRelease("tgg.lister", "1.1.0", "approved");
    await addRelease("tgg.lister", "1.2.0", "pending");
    await addRelease("tgg.lister-files", "1.0.0", "approved", [null]);
    await addRelease("tgg.lister-built", "1.0.0", "approved", [LINUX, MACOS]);
    const { layouts } = await pending();
    expect(layouts.map((layout) => [layout.id, layout.portVersion])).toEqual([
      [MACOS, "0.1.0-rc.8"],
    ]);
    const listed = layouts[0].releases.filter((release) => release.mod.startsWith("tgg.lister"));
    expect(listed).toEqual([
      { id: newer, mod: "tgg.lister", version: "1.1.0", commit: "0".repeat(40), class: null },
    ]);
  });

  it("also lists the newest release inside a set's range the newest is outside", async () => {
    const pinned = await addRelease("tgg.pinned", "0.1.0", "approved");
    await addRelease("tgg.pinned", "0.1.1-beta", "approved");
    await addRelease("tgg.pinned", "0.0.9", "approved");
    const newest = await addRelease("tgg.pinned", "0.2.0", "approved");
    await db.insert(codeModSets).values({
      name: "classic",
      title: "Classic",
      version: 1,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db
      .insert(codeModSetMods)
      .values({ setName: "classic", mod: "tgg.pinned", range: "0.1.0", position: 0 });
    const listed = (await pending()).layouts[0].releases.filter(
      (release) => release.mod === "tgg.pinned"
    );
    expect(listed.map((release) => release.id)).toEqual([newest, pinned]);
  });

  it("lists no layout for another target", async () => {
    const response = await request("/api/external-builds/pending?target=x86_64-linux-gnu", {
      headers: auth,
    });
    expect(await response.json()).toEqual({ layouts: [] });
  });

  it("doesn't serve the source of an unapproved release", async () => {
    const draft = await addRelease("tgg.source-draft", "1.0.0", "pending");
    const response = await request(`/api/external-builds/releases/${draft}/source`, {
      headers: auth,
    });
    expect(response.status).toBe(404);
  });
});

describe("uploads", () => {
  it("records a package the catalog then lists, and takes the same one again", async () => {
    const release = await addRelease("tgg.upload", "1.0.0", "approved");
    const { zip, report } = await macPackage("tgg.upload", "1.0.0");
    const response = await succeeded(release, zip, report);
    expect(response.status).toBe(200);
    const body = await response.json<{ build: string; status: string; sha256: string }>();
    expect(body).toMatchObject({ status: "succeeded", sha256: report.sha256 });

    const [build] = await db
      .select()
      .from(codeModBuilds)
      .where(and(eq(codeModBuilds.releaseId, release), eq(codeModBuilds.layoutId, MACOS)));
    expect(build).toMatchObject({
      status: "succeeded",
      packageSha256: report.sha256,
      packageSize: zip.length,
      netplay: "code",
      canonicalHooks: report.canonical_hooks,
      image: "macos-15 arm64, gcc-15 15.2.0, tgg 0.4.0",
    });
    const stored = await env.CODE_MODS.get(`code-mods/packages/${report.sha256}.zip`);
    expect(new Uint8Array(await stored!.arrayBuffer())).toEqual(zip);
    expect(await (await env.CODE_MODS.get(build.logKey!))!.text()).toBe("built");

    const catalog = await (
      await request(`/api/registry/catalog?layout=${MACOS}`)
    ).json<{ mods: { id: string; package: { sha256: string } }[] }>();
    expect(catalog.mods.find((mod) => mod.id === "tgg.upload")?.package.sha256).toBe(report.sha256);
    expect((await pending()).layouts[0].releases.some((listed) => listed.id === release)).toBe(
      false
    );

    // The same package again changes nothing; another is refused.
    const again = await succeeded(release, zip, report);
    expect(again.status).toBe(200);
    expect((await again.json<{ build: string }>()).build).toBe(body.build);
    const other = await macPackage("tgg.upload", "1.0.0", { description: "changed" });
    expect((await succeeded(release, other.zip, other.report)).status).toBe(409);
    expect(
      (await upload(release, { status: "failed", builder: "mac", log: new Blob(["x"]) })).status
    ).toBe(409);
  });

  it("refuses a package that isn't the release's for the layout", async () => {
    const release = await addRelease("tgg.mismatch", "2.0.0", "approved");
    const cases: [Record<string, unknown>, string][] = [
      [{ id: "tgg.other" }, "id"],
      [{ version: "2.0.1" }, "version"],
      [{ game_abi: LINUX }, "game_abi"],
      [{ target: "x86_64-linux-gnu" }, "target"],
      [{ entry: undefined }, "no library"],
    ];
    for (const [change, message] of cases) {
      const { zip, report } = await macPackage("tgg.mismatch", "2.0.0", change);
      const response = await succeeded(release, zip, report);
      expect(response.status).toBe(400);
      expect((await response.json<{ error: string }>()).error).toContain(message);
    }

    const { zip, report } = await macPackage("tgg.mismatch", "2.0.0");
    const lying = await succeeded(release, zip, { ...report, sha256: "0".repeat(64) });
    expect((await lying.json<{ error: string }>()).error).toContain("hashes to");
    const otherManifest = await succeeded(release, zip, {
      ...report,
      manifest: { ...report.manifest, name: "x" },
    });
    expect((await otherManifest.json<{ error: string }>()).error).toContain("differs");
    const library = zipSync({
      "manifest.json": new TextEncoder().encode(JSON.stringify(report.manifest)),
    });
    const noLibrary = await succeeded(release, library, {
      ...report,
      sha256: await sha256Hex(library),
      size: library.length,
    });
    expect((await noLibrary.json<{ error: string }>()).error).toContain("no mod.so");
    expect((await succeeded(release, zip, { ...report, netplay: "data" })).status).toBe(400);
    expect(
      (await upload(release, { status: "succeeded", builder: "mac", log: new Blob([""]) })).status
    ).toBe(400);

    const rows = await db
      .select()
      .from(codeModBuilds)
      .where(and(eq(codeModBuilds.releaseId, release), eq(codeModBuilds.layoutId, MACOS)));
    expect(rows).toEqual([]);
  });

  it("only takes approved releases, external layouts and releases with a library", async () => {
    const draft = await addRelease("tgg.upload-draft", "1.0.0", "pending");
    const draftPackage = await macPackage("tgg.upload-draft", "1.0.0");
    expect((await succeeded(draft, draftPackage.zip, draftPackage.report)).status).toBe(404);

    const approved = await addRelease("tgg.upload-linux", "1.0.0", "approved");
    const form = { status: "failed", builder: "mac", log: new Blob(["x"]) };
    expect((await upload(approved, form, LINUX)).status).toBe(404);
    expect((await upload(approved, form, "ffffffffffffffff")).status).toBe(404);

    const files = await addRelease("tgg.upload-files", "1.0.0", "approved", [null]);
    expect((await upload(files, form)).status).toBe(409);
  });

  it("records a failure with its log, offers it again on request, and takes a later success", async () => {
    const release = await addRelease("tgg.fails", "1.0.0", "approved");
    const failed = await upload(release, {
      status: "failed",
      builder: "mac",
      log: new Blob(["src/mod.c:1: error"]),
      error: "tgg mod build exited 1",
    });
    expect(failed.status).toBe(200);
    const [build] = await db
      .select()
      .from(codeModBuilds)
      .where(and(eq(codeModBuilds.releaseId, release), eq(codeModBuilds.layoutId, MACOS)));
    expect(build).toMatchObject({ status: "failed", error: "tgg mod build exited 1" });
    expect(await (await env.CODE_MODS.get(build.logKey!))!.text()).toBe("src/mod.c:1: error");

    const listed = (query: string) =>
      pending(query).then(({ layouts }) => layouts[0].releases.some((r) => r.id === release));
    expect(await listed("")).toBe(false);
    expect(await listed("&failed=retry")).toBe(true);

    const { zip, report } = await macPackage("tgg.fails", "1.0.0");
    expect((await succeeded(release, zip, report)).status).toBe(200);
    const [rebuilt] = await db.select().from(codeModBuilds).where(eq(codeModBuilds.id, build.id));
    expect(rebuilt).toMatchObject({
      status: "succeeded",
      error: null,
      packageSha256: report.sha256,
    });
  });
});
