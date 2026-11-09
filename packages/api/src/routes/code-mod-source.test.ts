import { createExecutionContext, env } from "cloudflare:test";
import { codeModReleases, codeMods, createDb, games } from "@vgskins/db";
import { Hono } from "hono";
import { beforeAll, expect, it } from "vitest";
import { fakeModSources } from "../test/mod-source";
import { signIn } from "../test/session";
import type { HonoEnv } from "../types";
import codeModReleasesRoutes from "./code-mod-releases";

// Anyone reads an approved release's source; a release still in review (or
// rejected) is its owner's and the moderators', and the diff is review
// material for them alone, even once approved.
const db = createDb(env.DB);
const app = new Hono<HonoEnv>().route("/api/code-mod-releases", codeModReleasesRoutes);
const NOW = Date.now();
const APPROVED = "1a".repeat(20);
const PENDING = "1b".repeat(20);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
let bindings: typeof env;
const cookies: Record<string, string> = {};

beforeAll(async () => {
  cookies.owner = await signIn(db, "owner");
  cookies.stranger = await signIn(db, "stranger");
  cookies.moderator = await signIn(db, "moderator", "moderator");
  await db.insert(games).values({
    id: "melee",
    name: "Super Smash Bros. Melee",
    slug: "melee",
    shortName: "Melee",
    createdAt: new Date(NOW),
    updatedAt: new Date(NOW),
  });
  await db.insert(codeMods).values({
    id: "mod1",
    userId: "owner",
    gameId: "melee",
    slug: "tgg.example",
    name: "Example",
    sourceKind: "push",
    createdAt: new Date(NOW),
    updatedAt: new Date(NOW),
  });
  for (const [id, version, commitSha, status, at] of [
    ["approved", "1.0.0", APPROVED, "approved", NOW - 2000],
    ["pending", "1.1.0", PENDING, "pending", NOW - 1000],
  ] as const) {
    await db.insert(codeModReleases).values({
      id,
      codeModId: "mod1",
      version,
      tag: version,
      commitSha,
      status,
      createdAt: new Date(at),
      updatedAt: new Date(at),
    });
  }
  const files = {
    "manifest.json": '{"id":"tgg.example","version":"1.0.0"}\n',
    "src/main.c": "int main(void) { return 0; }\n",
    "assets/icon.png": PNG,
  };
  bindings = {
    ...env,
    MOD_SOURCES: await fakeModSources("mod1", {
      [APPROVED]: files,
      [PENDING]: { ...files, "src/main.c": "int main(void) { return 1; }\n" },
    }),
  };
});

async function get(path: string, who?: string) {
  const response = await app.request(
    `/api/code-mod-releases/${path}`,
    { headers: who ? { cookie: cookies[who] } : {} },
    bindings,
    createExecutionContext()
  );
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

it("serves an approved release's source to anyone, binary files by size alone", async () => {
  const tree = await get("approved/tree");
  expect(tree.status).toBe(200);
  expect(tree.body.entries).toEqual([
    { path: "assets/icon.png", kind: "file" },
    { path: "manifest.json", kind: "file" },
    { path: "src/main.c", kind: "file" },
  ]);
  expect((await get("approved/file?path=src/main.c")).body).toEqual({
    path: "src/main.c",
    kind: "file",
    size: 29,
    binary: false,
    content: "int main(void) { return 0; }\n",
    truncated: false,
  });
  expect((await get("approved/file?path=assets/icon.png")).body).toMatchObject({
    size: PNG.length,
    binary: true,
    content: null,
  });
});

it("shows a release in review to its owner and moderators only", async () => {
  for (const path of ["pending/tree", "pending/file?path=src/main.c", "pending/listing"]) {
    expect((await get(path)).status, `${path} signed out`).toBe(404);
    expect((await get(path, "stranger")).status, `${path} as a stranger`).toBe(404);
    expect((await get(path, "owner")).status, `${path} as the owner`).toBe(200);
    expect((await get(path, "moderator")).status, `${path} as a moderator`).toBe(200);
  }
});

it("shows a diff to the owner and moderators only, even of an approved release", async () => {
  for (const path of ["approved/diff", "pending/diff", "pending/diff/file?path=src/main.c"]) {
    expect((await get(path)).status, `${path} signed out`).toBe(404);
    expect((await get(path, "stranger")).status, `${path} as a stranger`).toBe(404);
    expect((await get(path, "owner")).status, `${path} as the owner`).toBe(200);
    expect((await get(path, "moderator")).status, `${path} as a moderator`).toBe(200);
  }
});
