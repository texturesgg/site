import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { codeModReleases, codeMods, createDb, games, users } from "@vgskins/db";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { beforeAll, expect, it, vi } from "vitest";
import { signIn } from "../test/session";
import type { HonoEnv } from "../types";
import adminRoutes from "./admin";

// Review holds back every build but the pre-approval check: approving a
// release starts the build Workflow for the rest, and an admin can rebuild a
// failed or approved release. The Workflow belongs to packages/mod-build, so
// each request gets a binding that records what it was asked to start.
const db = createDb(env.DB);
const app = new Hono<HonoEnv>().route("/api/admin", adminRoutes);
const NOW = new Date();
let moderator: string;
let admin: string;

function buildWorkflow(fails = false) {
  const started: unknown[] = [];
  const binding = {
    create: async (options: { params: unknown }) => {
      if (fails) throw new Error("workflows are down");
      started.push(options.params);
      return { id: `run-${started.length}` };
    },
  } as unknown as Workflow;
  return { started, binding };
}

async function post(path: string, cookie: string, workflow: Workflow, body?: unknown) {
  const ctx = createExecutionContext();
  const response = await app.request(
    `/api/admin${path}`,
    {
      method: body === undefined ? "POST" : "PUT",
      headers: body === undefined ? { cookie } : { cookie, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    { ...env, MOD_BUILD: workflow },
    ctx
  );
  await waitOnExecutionContext(ctx);
  return response;
}

async function addRelease(id: string, status: "pending" | "failed" | "approved" | "rejected") {
  await db.insert(codeModReleases).values({
    id,
    codeModId: "me.mod",
    version: id,
    tag: id,
    commitSha: "0".repeat(40),
    status,
    error: status === "failed" ? "build limit reached; try again later" : null,
    createdAt: NOW,
    updatedAt: NOW,
  });
}

async function status(id: string) {
  const [row] = await db.select().from(codeModReleases).where(eq(codeModReleases.id, id));
  return { status: row.status, error: row.error };
}

beforeAll(async () => {
  vi.spyOn(env.FLAGS, "getBooleanValue").mockResolvedValue(true);
  moderator = await signIn(db, "moderator", "moderator");
  admin = await signIn(db, "admin", "admin");
  await signIn(db, "author");
  await db.insert(games).values({
    id: "melee",
    name: "Super Smash Bros. Melee",
    slug: "melee",
    shortName: "Melee",
    createdAt: NOW,
    updatedAt: NOW,
  });
  await db.insert(codeMods).values({
    id: "me.mod",
    userId: "author",
    gameId: "melee",
    slug: "me.mod",
    name: "Mod",
    sourceKind: "push",
    createdAt: NOW,
    updatedAt: NOW,
  });
});

it("approving a release starts its builds for the targets review held back", async () => {
  await addRelease("1.0.0", "pending");
  const workflow = buildWorkflow();
  const response = await post("/code-mods/releases/1.0.0/approve", moderator, workflow.binding);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ success: true, status: "approved", buildStarted: true });
  expect(workflow.started).toEqual([{ type: "approved", release: "1.0.0" }]);
});

it("an approval stands when its builds can't start, and says so", async () => {
  await addRelease("1.0.1", "pending");
  const response = await post(
    "/code-mods/releases/1.0.1/approve",
    moderator,
    buildWorkflow(true).binding
  );
  expect(await response.json()).toMatchObject({ status: "approved", buildStarted: false });
  expect((await status("1.0.1")).status).toBe("approved");
});

it("rejecting a release starts nothing", async () => {
  await addRelease("1.0.2", "pending");
  const workflow = buildWorkflow();
  expect((await post("/code-mods/releases/1.0.2/reject", moderator, workflow.binding)).status).toBe(
    200
  );
  expect(workflow.started).toEqual([]);
});

it("an admin's rebuild checks a failed release again", async () => {
  await addRelease("1.1.0", "failed");
  const workflow = buildWorkflow();
  expect(
    (await post("/code-mods/releases/1.1.0/rebuild", moderator, workflow.binding)).status
  ).toBe(403);
  const response = await post("/code-mods/releases/1.1.0/rebuild", admin, workflow.binding);
  expect(response.status).toBe(200);
  expect(workflow.started).toEqual([{ type: "check", release: "1.1.0" }]);
  expect(await status("1.1.0")).toEqual({ status: "processing", error: null });
  // Already processing: a second rebuild starts nothing.
  expect((await post("/code-mods/releases/1.1.0/rebuild", admin, workflow.binding)).status).toBe(
    409
  );
  expect(workflow.started).toHaveLength(1);
});

it("a rebuild that can't start leaves the release failed", async () => {
  await addRelease("1.1.1", "failed");
  const response = await post(
    "/code-mods/releases/1.1.1/rebuild",
    admin,
    buildWorkflow(true).binding
  );
  expect(response.status).toBe(503);
  expect((await status("1.1.1")).status).toBe("failed");
});

it("an admin's rebuild of an approved release builds its missing targets", async () => {
  const workflow = buildWorkflow();
  expect((await post("/code-mods/releases/1.0.0/rebuild", admin, workflow.binding)).status).toBe(
    200
  );
  expect(workflow.started).toEqual([{ type: "approved", release: "1.0.0" }]);
  await addRelease("1.2.0", "rejected");
  expect((await post("/code-mods/releases/1.2.0/rebuild", admin, workflow.binding)).status).toBe(
    409
  );
});

it("only an admin marks an author trusted", async () => {
  const workflow = buildWorkflow().binding;
  expect((await post("/users/author/trusted", moderator, workflow, { trusted: true })).status).toBe(
    403
  );
  expect((await post("/users/nobody/trusted", admin, workflow, { trusted: true })).status).toBe(
    404
  );
  expect((await post("/users/author/trusted", admin, workflow, { trusted: true })).status).toBe(
    200
  );
  const [author] = await db.select().from(users).where(eq(users.id, "author"));
  expect(author.trusted).toBe(true);
});

it("only an admin sets a mod's publisher", async () => {
  const workflow = buildWorkflow().binding;
  const body = { name: "textures.gg", official: true };
  expect((await post("/code-mods/me.mod/publisher", moderator, workflow, body)).status).toBe(403);
  expect((await post("/code-mods/nothing/publisher", admin, workflow, body)).status).toBe(404);
  expect((await post("/code-mods/me.mod/publisher", admin, workflow, body)).status).toBe(200);
  const [mod] = await db.select().from(codeMods).where(eq(codeMods.id, "me.mod"));
  expect(mod).toMatchObject({ publisherName: "textures.gg", official: true });
  await post("/code-mods/me.mod/publisher", admin, workflow, { name: null, official: false });
  const [reset] = await db.select().from(codeMods).where(eq(codeMods.id, "me.mod"));
  expect(reset).toMatchObject({ publisherName: null, official: false });
});
