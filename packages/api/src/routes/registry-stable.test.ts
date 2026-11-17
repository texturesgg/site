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

// A stable-tier library has no game layout: it loads on any port with its
// target whose API loads it (api-strategy.md, the 1.x compatibility rule), so
// the catalog of one layout serves the stable builds made for others.
const db = createDb(env.DB);
const app = new Hono<HonoEnv>().route("/api/registry", registryRoutes);
const NOW = new Date();

// Layouts by target and the API their port offers.
const LAYOUTS = {
  linux12: ["x86_64-linux-gnu", "1.2"],
  linux14: ["x86_64-linux-gnu", "1.4"],
  linux20: ["x86_64-linux-gnu", "2.0"],
  linuxOld: ["x86_64-linux-gnu", null],
  windows14: ["x86_64-windows-gnu", "1.4"],
  linux010: ["x86_64-linux-gnu", "0.10"],
  linux011: ["x86_64-linux-gnu", "0.11"],
} satisfies Record<string, [string, string | null]>;
type Layout = keyof typeof LAYOUTS;
const layoutId = (name: Layout) => name.padEnd(16, "0");

type Build = {
  layout: Layout;
  tier: "stable" | "game";
  api: string;
  experimental?: boolean;
};

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

/** The package each mod in `layout`'s catalog is served, as `mod layout`. */
async function served(layout: Layout): Promise<string[]> {
  const ctx = createExecutionContext();
  const response = await app.request(
    `/api/registry/catalog?layout=${layoutId(layout)}`,
    {},
    env,
    ctx
  );
  await waitOnExecutionContext(ctx);
  expect(response.status).toBe(200);
  const body: { mods: { id: string; package: { sha256: string } }[] } = await response.json();
  return body.mods.map((mod) => mod.package.sha256.replace(`${mod.id}-`, `${mod.id} `));
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
  for (const [name, [target, apiVersion]] of Object.entries(LAYOUTS)) {
    await db.insert(codeModLayouts).values({
      id: name.padEnd(16, "0"),
      api: "tgg-melee/1",
      apiVersion,
      port: "tgg-melee",
      target,
      portVersion: name,
      createdAt: NOW,
    });
  }
  await addRelease("a.stable", [{ layout: "linux12", tier: "stable", api: "1.2" }]);
  await addRelease("b.game", [{ layout: "linux12", tier: "game", api: "1.2" }]);
  await addRelease("c.experimental", [
    { layout: "linux12", tier: "stable", api: "1.2", experimental: true },
  ]);
  await addRelease("d.both", [
    { layout: "linux12", tier: "stable", api: "1.2" },
    { layout: "linux14", tier: "stable", api: "1.4" },
  ]);
  await addRelease("e.pre1", [{ layout: "linux010", tier: "stable", api: "0.10" }]);
});

describe("stable-tier packages in the catalog", () => {
  it("serves a layout its own builds", async () => {
    expect(await served("linux12")).toEqual([
      "a.stable linux12",
      "b.game linux12",
      "c.experimental linux12",
      "d.both linux12",
    ]);
  });

  it("serves a stable build to a newer minor of the same major, its own build first", async () => {
    // b.game stays on its layout; c.experimental needs its exact minor.
    expect(await served("linux14")).toEqual(["a.stable linux12", "d.both linux14"]);
  });

  it("serves nothing borrowed across a major, a target, or to a layout without an API", async () => {
    expect(await served("linux20")).toEqual([]);
    expect(await served("windows14")).toEqual([]);
    expect(await served("linuxOld")).toEqual([]);
  });

  it("needs the same minor before 1.0", async () => {
    expect(await served("linux010")).toEqual(["e.pre1 linux010"]);
    expect(await served("linux011")).toEqual([]);
  });
});

it("says when a mod is tied to the minor it was built for", async () => {
  const oneVersion = async (id: string) => {
    const response = await app.request(`/api/registry/mods/${id}`, {}, env);
    expect(response.status).toBe(200);
    const body: { oneVersion: boolean } = await response.json();
    return body.oneVersion;
  };
  expect(await oneVersion("c.experimental")).toBe(true);
  expect(await oneVersion("a.stable")).toBe(false);
});
