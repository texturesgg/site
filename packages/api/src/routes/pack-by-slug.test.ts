import { createExecutionContext, env } from "cloudflare:test";
import { createDb, games, packs, targets } from "@vgskins/db";
import { Hono } from "hono";
import { beforeAll, expect, it } from "vitest";
import { signIn } from "../test/session";
import type { HonoEnv } from "../types";
import gamesRoutes from "./games";

const db = createDb(env.DB);
const NOW = new Date();
const app = new Hono<HonoEnv>().route("/api/games", gamesRoutes);

beforeAll(async () => {
  await db.insert(games).values(
    ["melee", "brawl"].map((slug) => ({
      id: slug,
      name: slug,
      slug,
      shortName: slug,
      createdAt: NOW,
      updatedAt: NOW,
    }))
  );
  await db.insert(targets).values(
    ["melee", "brawl"].map((gameId) => ({
      id: `${gameId}-fox`,
      gameId,
      name: "Fox",
      slug: "fox",
      category: "character" as const,
    }))
  );
  await signIn(db, "owner");
  await db.insert(packs).values(
    ["melee", "brawl"].map((gameId) => ({
      id: `${gameId}-pack`,
      userId: "owner",
      gameId,
      targetId: `${gameId}-fox`,
      title: `${gameId} pack`,
      slug: "red-fox",
      status: "approved" as const,
      createdAt: NOW,
      updatedAt: NOW,
    }))
  );
});

it("a pack slug resolves within its own game", async () => {
  for (const game of ["melee", "brawl"]) {
    const response = await app.request(
      `/api/games/${game}/packs/red-fox`,
      {},
      env,
      createExecutionContext()
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: `${game}-pack` });
  }
});
