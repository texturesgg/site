import { env } from "cloudflare:test";
import { codeModLayouts, createDb } from "@vgskins/db";
import { Hono } from "hono";
import { beforeAll, expect, it, vi } from "vitest";
import type { HonoEnv } from "../types";
import modDocsRoutes, { MOD_DOCS_MIRROR } from "./mod-docs";

// The docs pages read what each tgg-melee release mirrors; a release whose
// docs aren't mirrored (one from before the mirror) is skipped.
const db = createDb(env.DB);
const app = new Hono<HonoEnv>().route("/api/docs/mods", modDocsRoutes);

const MIRROR: Record<string, string> = {
  "0.1.0-rc.12/docs/index.json": JSON.stringify({
    format: 1,
    version: "0.1.0-rc.12",
    pages: ["README", "hooks"],
    headers: ["tgg/mod.h"],
  }),
  "0.1.0-rc.12/docs/hooks.md": "# Hooks\n\nBefore, after and replace.",
  "0.1.0-rc.12/docs/include/tgg/mod.h": "#define TGG_MOD 1\n",
};

beforeAll(async () => {
  // rc.11 has no mirrored docs; 0.2.0-rc.1 is newer but not mirrored yet.
  for (const [i, version] of ["0.1.0-rc.11", "0.1.0-rc.12", "0.2.0-rc.1"].entries()) {
    await db.insert(codeModLayouts).values({
      id: String(i).repeat(16),
      api: "tgg-melee/0",
      port: "tgg-melee",
      target: "x86_64-linux-gnu",
      portVersion: version,
      createdAt: new Date(),
    });
  }
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input instanceof Request ? input.url : input);
    const path = url.startsWith(`${MOD_DOCS_MIRROR}/`) ? url.slice(MOD_DOCS_MIRROR.length + 1) : "";
    const body = MIRROR[decodeURIComponent(path)];
    return body === undefined ? new Response("missing", { status: 404 }) : new Response(body);
  });
});

const get = (path: string) => app.request(`/api/docs/mods${path}`, {}, env);

it("resolves latest and a minor to the newest release with mirrored docs", async () => {
  for (const wanted of ["latest", "0.1"]) {
    const response = await get(`/${wanted}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      version: "0.1.0-rc.12",
      minor: "0.1",
      minors: ["0.2", "0.1"],
      pages: ["README", "hooks"],
      headers: ["tgg/mod.h"],
    });
  }
  expect((await get("/0.2")).status).toBe(404);
  expect((await get("/0.9")).status).toBe(404);
  expect((await get("/v1")).status).toBe(400);
});

it("serves a listed page and header, and nothing else", async () => {
  expect(await (await get("/0.1/pages/hooks")).json()).toEqual({
    version: "0.1.0-rc.12",
    minor: "0.1",
    text: "# Hooks\n\nBefore, after and replace.",
  });
  expect(await (await get("/latest/headers/mod")).json()).toMatchObject({
    text: "#define TGG_MOD 1\n",
  });
  expect((await get("/0.1/pages/events")).status).toBe(404);
  expect((await get("/0.1/headers/events")).status).toBe(404);
  expect((await get("/0.1/pages/..%2Fsecrets")).status).toBe(400);
});
