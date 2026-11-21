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
import { beforeAll, describe, expect, it, vi } from "vitest";
import { signIn } from "../test/session";
import type { HonoEnv } from "../types";
import registryRoutes from "./registry";

// A mod's `targets` in the mods list are the systems the newest port's
// catalogs serve it on. A stable-tier build made for an older port still
// loads on the newest one when its API allows it, so it counts too.
const db = createDb(env.DB);
const app = new Hono<HonoEnv>().route("/api/registry", registryRoutes);
const NOW = new Date();

// [target, port version, API, active]
const LAYOUTS = {
  linux11: ["x86_64-linux-gnu", "0.1.0-rc.11", "1.0", false],
  linux12: ["x86_64-linux-gnu", "0.1.0-rc.12", "1.0", true],
  windows12: ["x86_64-windows-gnu", "0.1.0-rc.12", "1.0", true],
  linux13: ["x86_64-linux-gnu", "0.1.0-rc.13", "1.1", true],
  windows13: ["x86_64-windows-gnu", "0.1.0-rc.13", "1.1", true],
  macos13: ["aarch64-apple-darwin", "0.1.0-rc.13", "1.1", true],
} satisfies Record<string, [string, string, string, boolean]>;
type Layout = keyof typeof LAYOUTS;
const layoutId = (name: Layout) => name.padEnd(16, "0");

type Build = { layout: Layout; tier: "stable" | "game"; api: string; experimental?: boolean };

/** An approved release of `slug` with a build for each of `builds`. */
async function addRelease(slug: string, builds: Build[]) {
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
  const releaseId = `${slug}@1.0.0`;
  await db.insert(codeModReleases).values({
    id: releaseId,
    codeModId: slug,
    version: "1.0.0",
    tag: "v1.0.0",
    commitSha: "0".repeat(40),
    status: "approved",
    kind: "native",
    createdAt: NOW,
    updatedAt: NOW,
  });
  for (const build of builds) {
    const [target] = LAYOUTS[build.layout];
    await db.insert(codeModBuilds).values({
      id: `${releaseId}-${build.layout}`,
      releaseId,
      layoutId: layoutId(build.layout),
      status: "succeeded",
      packageKey: `code-mods/packages/${slug}-${build.layout}.zip`,
      packageSha256: `${slug}-${build.layout}`,
      packageSize: 1,
      manifest: {
        api: "tgg-melee/1",
        id: slug,
        name: slug,
        version: "1.0.0",
        entry: "mod.so",
        tier: build.tier,
        target,
        api_version: build.api,
        ...(build.tier === "game" ? { game_abi: layoutId(build.layout) } : {}),
        ...(build.experimental ? { experimental: true } : {}),
      },
      netplay: "code",
      createdAt: NOW,
    });
  }
}

async function get(path: string) {
  const ctx = createExecutionContext();
  const response = await app.request(path, {}, env, ctx);
  await waitOnExecutionContext(ctx);
  expect(response.status).toBe(200);
  return response;
}

/** Each listed mod's `targets`, by id. */
async function listedTargets(): Promise<Record<string, string[]>> {
  const body: { port: string | null; items: { id: string; targets: string[] }[] } = await (
    await get("/api/registry/mods?pageSize=100")
  ).json();
  expect(body.port).toBe("0.1.0-rc.13");
  return Object.fromEntries(body.items.map((mod) => [mod.id, mod.targets]));
}

/** The mods `layout`'s catalog serves. */
async function served(layout: Layout): Promise<string[]> {
  const body: { mods: { id: string }[] } = await (
    await get(`/api/registry/catalog?layout=${layoutId(layout)}`)
  ).json();
  return body.mods.map((mod) => mod.id);
}

beforeAll(async () => {
  vi.spyOn(env.FLAGS, "getBooleanValue").mockResolvedValue(true);
  await signIn(db, "owner");
  await db.insert(games).values({
    id: "melee",
    name: "Super Smash Bros. Melee",
    slug: "melee",
    shortName: "Melee",
    createdAt: NOW,
    updatedAt: NOW,
  });
  for (const [name, [target, portVersion, apiVersion, active]] of Object.entries(LAYOUTS)) {
    await db.insert(codeModLayouts).values({
      id: name.padEnd(16, "0"),
      api: "tgg-melee/1",
      apiVersion,
      port: "tgg-melee",
      target,
      portVersion,
      active,
      createdAt: NOW,
    });
  }
  await addRelease("a.stable-old", [
    { layout: "linux12", tier: "stable", api: "1.0" },
    { layout: "windows12", tier: "stable", api: "1.0" },
  ]);
  await addRelease("b.game-old", [
    { layout: "linux12", tier: "game", api: "1.0" },
    { layout: "windows12", tier: "game", api: "1.0" },
  ]);
  await addRelease("c.experimental-old", [
    { layout: "linux12", tier: "stable", api: "1.0", experimental: true },
  ]);
  await addRelease("d.retired-layout", [{ layout: "linux11", tier: "stable", api: "1.0" }]);
  await addRelease("e.current", [{ layout: "macos13", tier: "game", api: "1.1" }]);
});

describe("a mod's targets in the mods list", () => {
  it("count stable builds the newest port loads, and nothing it doesn't", async () => {
    expect(await listedTargets()).toEqual({
      "a.stable-old": ["linux", "windows"],
      "b.game-old": [],
      "c.experimental-old": [],
      "d.retired-layout": ["linux"],
      "e.current": ["macos"],
    });
  });

  it("match what the newest port's catalogs serve", async () => {
    const targets = await listedTargets();
    const systems: [Layout, string][] = [
      ["linux13", "linux"],
      ["windows13", "windows"],
      ["macos13", "macos"],
    ];
    for (const [layout, system] of systems) {
      const listed = Object.keys(targets).filter((id) => targets[id].includes(system));
      expect(await served(layout)).toEqual(listed);
    }
  });

  it("are the same on a mod's details", async () => {
    const body: { targets: string[] } = await (await get("/api/registry/mods/a.stable-old")).json();
    expect(body.targets).toEqual(["linux", "windows"]);
  });
});
