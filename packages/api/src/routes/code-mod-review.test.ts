import { createExecutionContext, env } from "cloudflare:test";
import {
  codeModBuilds,
  codeModReleaseDependencies,
  codeModReleases,
  codeMods,
  createDb,
  games,
  users,
} from "@vgskins/db";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { beforeAll, expect, it, vi } from "vitest";
import { fakeModSources } from "../test/mod-source";
import { signIn } from "../test/session";
import type { HonoEnv } from "../types";
import adminRoutes from "./admin";
import codeModReleasesRoutes from "./code-mod-releases";

// A pending release is reviewed like a pull request against the mod's last
// approved release: its source diff, its listing beside that release's, and
// what the author's earlier releases came to.
const db = createDb(env.DB);
const app = new Hono<HonoEnv>()
  .route("/api/code-mod-releases", codeModReleasesRoutes)
  .route("/api/admin", adminRoutes);
const NOW = Date.now();
const FIRST = "2a".repeat(20);
const REJECTED = "2b".repeat(20);
const PENDING = "2c".repeat(20);
let bindings: typeof env;
let moderator: string;

const main = (lines: string[]) => `${lines.join("\n")}\n`;
const BEFORE = ["#include <tgg.h>", "", "void a(void) {}", "void b(void) {}", "void c(void) {}"];
const AFTER = [
  "#include <tgg.h>",
  "",
  "void a(void) {}",
  "void b(void) { tgg_log(1); }",
  "void c(void) {}",
  "void d(void) {}",
];

beforeAll(async () => {
  moderator = await signIn(db, "moderator", "moderator");
  await signIn(db, "author");
  await db.update(users).set({ trusted: true }).where(eq(users.id, "author"));
  await db.insert(games).values({
    id: "melee",
    name: "Super Smash Bros. Melee",
    slug: "melee",
    shortName: "Melee",
    createdAt: new Date(NOW),
    updatedAt: new Date(NOW),
  });
  await db.insert(codeMods).values({
    id: "mod2",
    userId: "author",
    gameId: "melee",
    slug: "tgg.review",
    name: "Review",
    sourceKind: "push",
    createdAt: new Date(NOW),
    updatedAt: new Date(NOW),
  });
  for (const [id, version, commitSha, status, at] of [
    ["first", "1.0.0", FIRST, "approved", NOW - 3000],
    ["rejected", "1.1.0", REJECTED, "rejected", NOW - 2000],
    ["pending", "1.2.0", PENDING, "pending", NOW - 1000],
  ] as const) {
    await db.insert(codeModReleases).values({
      id,
      codeModId: "mod2",
      version,
      tag: version,
      commitSha,
      status,
      tags: id === "pending" ? ["competitive", "netplay"] : ["competitive"],
      readme: `# Review ${version}`,
      createdAt: new Date(at),
      updatedAt: new Date(at),
    });
  }
  await db
    .insert(codeModReleaseDependencies)
    .values({ releaseId: "pending", dependency: "tgg.events", range: "^1.0" });
  await db.insert(codeModBuilds).values({
    id: "pending-check",
    releaseId: "pending",
    layoutId: null,
    status: "succeeded",
    manifest: { name: "Review", description: "Now with d", files: [{ path: "GrPs.dat", size: 4 }] },
    canonicalHooks: { before: [], after: ["Stage_Init"], replaces: [] },
    netplay: "files",
    createdAt: new Date(NOW),
  });
  const shared = { "include/tgg.h": "#pragma once\n", "docs/notes.md": "Notes\n" };
  bindings = {
    ...env,
    MOD_SOURCES: await fakeModSources("mod2", {
      [FIRST]: { ...shared, "src/main.c": main(BEFORE), "src/old.c": "int old;\n" },
      // Rejected, so never a base: had the diff used it, src/main.c would be unchanged.
      [REJECTED]: { ...shared, "src/main.c": main(AFTER) },
      [PENDING]: {
        "include/tgg.h": "#pragma once\n",
        "docs/guide.md": "Notes\n",
        "src/main.c": main(AFTER),
        "src/new.c": "int fresh;",
      },
    }),
  };
  vi.spyOn(env.FLAGS, "getBooleanValue").mockResolvedValue(true);
});

async function get(path: string) {
  const response = await app.request(
    path,
    { headers: { cookie: moderator } },
    bindings,
    createExecutionContext()
  );
  expect(response.status, path).toBe(200);
  return response.json<Record<string, unknown>>();
}

it("diffs a pending release against the last approved one", async () => {
  const diff = await get("/api/code-mod-releases/pending/diff");
  expect(diff.base).toMatchObject({ id: "first", commit: FIRST });
  expect(diff.files).toEqual([
    {
      path: "docs/guide.md",
      previousPath: "docs/notes.md",
      status: "renamed",
      binary: false,
      additions: 0,
      deletions: 0,
    },
    {
      path: "src/main.c",
      previousPath: null,
      status: "modified",
      binary: false,
      additions: 2,
      deletions: 1,
    },
    {
      path: "src/new.c",
      previousPath: null,
      status: "added",
      binary: false,
      additions: 1,
      deletions: 0,
    },
    {
      path: "src/old.c",
      previousPath: null,
      status: "removed",
      binary: false,
      additions: 0,
      deletions: 1,
    },
  ]);

  const file = await get("/api/code-mod-releases/pending/diff/file?path=src/main.c");
  expect(file.patch).toBe(
    [
      "--- a/src/main.c",
      "+++ b/src/main.c",
      "@@ -1,5 +1,6 @@",
      " #include <tgg.h>",
      " ",
      " void a(void) {}",
      "-void b(void) {}",
      "+void b(void) { tgg_log(1); }",
      " void c(void) {}",
      "+void d(void) {}",
      "",
    ].join("\n")
  );
  const added = await get("/api/code-mod-releases/pending/diff/file?path=src/new.c");
  expect(added.patch).toBe(
    "--- /dev/null\n+++ b/src/new.c\n@@ -0,0 +1,1 @@\n+int fresh;\n\\ No newline at end of file\n"
  );

  const first = await get("/api/code-mod-releases/first/diff");
  expect(first).toMatchObject({ base: null, files: [] });
});

it("lists a pending release beside the last approved one", async () => {
  const listing = await get("/api/code-mod-releases/pending/listing");
  expect(listing.release).toMatchObject({
    id: "pending",
    status: "pending",
    name: "Review",
    description: "Now with d",
    readme: "# Review 1.2.0",
    tags: ["competitive", "netplay"],
    depends: [{ id: "tgg.events", range: "^1.0" }],
    netplay: "files",
    hooks: { before: [], after: ["Stage_Init"], replaces: [] },
    files: [{ path: "GrPs.dat", size: 4 }],
  });
  expect(listing.previous).toMatchObject({
    id: "first",
    readme: "# Review 1.0.0",
    tags: ["competitive"],
    depends: [],
    netplay: null,
  });
});

it("says in the review queue whether the author is trusted and how their releases went", async () => {
  const { items } = await get("/api/admin/code-mods/releases/pending");
  expect(items).toEqual([
    expect.objectContaining({
      id: "pending",
      userName: "author",
      trusted: true,
      approvedReleases: 1,
      rejectedReleases: 1,
    }),
  ]);
});
