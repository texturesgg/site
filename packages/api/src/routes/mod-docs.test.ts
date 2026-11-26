import { env } from "cloudflare:test";
import { codeModLayouts, createDb } from "@vgskins/db";
import { Hono } from "hono";
import { beforeAll, expect, it, vi } from "vitest";
import type { Env, HonoEnv } from "../types";
import modDocsRoutes, { MOD_DOCS_MIRROR } from "./mod-docs";

const db = createDb(env.DB);
const app = new Hono<HonoEnv>().route("/api/docs/mods", modDocsRoutes);

const FORMAT_2_INDEX = {
  format: 2,
  version: "1.0.0",
  nav: [
    { title: "Start", pages: ["start/quickstart"] },
    { title: "Native C", advanced: true, pages: ["native/hooks"] },
  ],
  pages: {
    index: { title: "Making mods", label: "Overview", description: "Intro.", headings: [] },
    "start/quickstart": {
      title: "Your first mod",
      label: "Quickstart",
      description: "Five minutes.",
      headings: [{ depth: 2, id: "install", text: "Install" }],
    },
    "native/hooks": {
      title: "Hooks",
      description: "Game hooks.",
      headings: [{ depth: 2, id: "before-after-replace", text: "Before, after and replace" }],
    },
  },
  headers: ["tgg/mod.h"],
  redirects: { hooks: "native/hooks" },
};

const MIRROR: Record<string, string> = {
  // Format 1 index on 0.1 must be ignored and excluded from minors.
  "0.1.0-rc.12/docs/index.json": JSON.stringify({
    format: 1,
    version: "0.1.0-rc.12",
    pages: ["README", "hooks"],
    headers: ["tgg/mod.h"],
  }),
  "1.0.0/docs/index.json": JSON.stringify(FORMAT_2_INDEX),
  "1.0.0/docs/start/quickstart.md":
    "---\ntitle: Your first mod\ndescription: Five minutes.\n---\n\n## Install\n",
  "1.0.0/docs/include/tgg/mod.h": "#define TGG_MOD 1\n",
  "1.0.0/docs/images/hud-overlay.webp": "RIFFwebp",
  "1.0.0/docs/tgg.luau": "--!strict\nreturn {}\n",
  "1.0.0/docs/search.json": JSON.stringify({
    format: 2,
    version: "1.0.0",
    records: [
      {
        id: "s:reference/fighter#set_percent",
        kind: "symbol",
        symbolKind: "method",
        page: "reference/fighter",
        anchor: "set_percent",
        section: "Reference",
        title: "fighter:set_percent",
        pageTitle: "Fighter",
        cName: "tgg_fighter_set_percent",
        signature: "fighter:set_percent(percent: number): ()",
        text: "Sets the fighter's percent.",
      },
    ],
  }),
  "main/docs/index.json": JSON.stringify({ ...FORMAT_2_INDEX, version: "main" }),
  "main/docs/start/quickstart.md":
    "---\ntitle: Your first mod\ndescription: Main.\n---\n\nMain copy.\n",
};

beforeAll(async () => {
  for (const [i, version] of ["0.1.0-rc.12", "1.0.0", "1.1.0-rc.1"].entries()) {
    await db.insert(codeModLayouts).values({
      id: String(i).repeat(16),
      api: "tgg-melee/1",
      port: "tgg-melee",
      target: "x86_64-linux-gnu",
      portVersion: version,
      createdAt: new Date(),
    });
  }
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input instanceof Request ? input.url : input);
    const prefixes = [`${MOD_DOCS_MIRROR}/`, "http://127.0.0.1:8799/"];
    const prefix = prefixes.find((p) => url.startsWith(p));
    const path = prefix ? url.slice(prefix.length) : "";
    const body = MIRROR[decodeURIComponent(path)];
    return body === undefined ? new Response("missing", { status: 404 }) : new Response(body);
  });
});

const get = (path: string, customEnv: Env = env) =>
  app.request(`/api/docs/mods${path}`, {}, customEnv);

it("resolves latest, a format 2 minor, and main, while skipping format 1 releases", async () => {
  for (const wanted of ["latest", "1.0"]) {
    const response = await get(`/${wanted}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      version: "1.0.0",
      minor: "1.0",
      minors: ["1.0"],
      nav: FORMAT_2_INDEX.nav,
      pages: FORMAT_2_INDEX.pages,
      headers: FORMAT_2_INDEX.headers,
      redirects: FORMAT_2_INDEX.redirects,
    });
  }

  const mainRes = await get("/main");
  expect(mainRes.status).toBe(200);
  expect(await mainRes.json()).toMatchObject({
    version: "main",
    minor: "main",
    minors: ["1.0"],
  });

  // Format 1 minor 0.1 and unmirrored 1.1 are not served.
  expect((await get("/0.1")).status).toBe(404);
  expect((await get("/1.1")).status).toBe(404);
  expect((await get("/v1")).status).toBe(400);
});

it("serves nested pages, headers, and images, and rejects invalid or unlisted paths", async () => {
  expect(await (await get("/1.0/page?path=start/quickstart")).json()).toEqual({
    version: "1.0.0",
    minor: "1.0",
    text: "---\ntitle: Your first mod\ndescription: Five minutes.\n---\n\n## Install\n",
  });
  expect(await (await get("/main/page?path=start/quickstart")).json()).toMatchObject({
    version: "main",
    minor: "main",
  });
  expect(await (await get("/latest/headers/mod")).json()).toMatchObject({
    text: "#define TGG_MOD 1\n",
  });
  const img = await get("/1.0/images/hud-overlay.webp");
  expect(img.status).toBe(200);
  expect(img.headers.get("content-type")).toBe("image/webp");
  expect(await img.text()).toBe("RIFFwebp");

  expect((await get("/1.0/page?path=guides/missing")).status).toBe(404);
  expect((await get("/1.0/page?path=../secrets")).status).toBe(400);
  expect((await get("/1.0/headers/events")).status).toBe(404);
  expect((await get("/1.0/images/missing.webp")).status).toBe(404);
  expect((await get("/1.0/images/bad.svg")).status).toBe(400);
});

it("honors MOD_DOCS_MIRROR env override with no-store caching", async () => {
  const res = await get("/main", { ...env, MOD_DOCS_MIRROR: "http://127.0.0.1:8799" });
  expect(res.status).toBe(200);
  expect(res.headers.get("cache-control")).toBe("no-store");
});

it("serves search.json and tgg.luau for mirrored releases", async () => {
  const searchRes = await get("/1.0/search");
  expect(searchRes.status).toBe(200);
  expect(await searchRes.json()).toMatchObject({
    format: 2,
    version: "1.0.0",
    records: [{ title: "fighter:set_percent", cName: "tgg_fighter_set_percent" }],
  });
  expect((await get("/main/search")).status).toBe(404);

  const typesRes = await get("/1.0/tgg.luau");
  expect(typesRes.status).toBe(200);
  expect(typesRes.headers.get("content-type")).toBe("text/plain; charset=utf-8");
  expect(typesRes.headers.get("content-disposition")).toContain("inline");
  expect(await typesRes.text()).toBe("--!strict\nreturn {}\n");

  const dlRes = await get("/1.0/tgg.luau?download=1");
  expect(dlRes.status).toBe(200);
  expect(dlRes.headers.get("content-disposition")).toContain("attachment");
});
