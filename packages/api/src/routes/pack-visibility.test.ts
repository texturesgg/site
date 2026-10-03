import { createExecutionContext, env } from "cloudflare:test";
import { comments, createDb, games, packs, targets } from "@vgskins/db";
import { Hono } from "hono";
import { beforeAll, describe, expect, it } from "vitest";
import { signIn } from "../test/session";
import type { HonoEnv } from "../types";
import packsRoutes from "./packs";
import reportsRoutes from "./reports";

const db = createDb(env.DB);
let owner: string;
let moderator: string;
let stranger: string;
const NOW = new Date();
const app = new Hono<HonoEnv>()
  .route("/api/packs", packsRoutes)
  .route("/api/reports", reportsRoutes);

function get(path: string, cookie?: string) {
  return app.request(
    `/api/packs/by-id/${path}`,
    { headers: cookie ? { cookie } : {} },
    env,
    createExecutionContext()
  );
}

const commentsOf = (packId: string, cookie?: string) => get(`${packId}/comments`, cookie);

beforeAll(async () => {
  owner = await signIn(db, "owner");
  moderator = await signIn(db, "moderator", "moderator");
  stranger = await signIn(db, "stranger");

  await db.insert(games).values({
    id: "game",
    name: "Super Smash Bros. Melee",
    slug: "melee",
    shortName: "Melee",
    createdAt: NOW,
    updatedAt: NOW,
  });
  await db.insert(targets).values({
    id: "target",
    gameId: "game",
    name: "Fox",
    slug: "fox",
    category: "character",
  });
  await db.insert(packs).values(
    (
      [
        ["approved", "approved", null],
        ["rejected", "rejected", null],
        ["deleted", "approved", NOW],
      ] as const
    ).map(([id, status, deletedAt]) => ({
      id,
      userId: "owner",
      gameId: "game",
      targetId: "target",
      title: id,
      slug: id,
      status,
      deletedAt,
      createdAt: NOW,
      updatedAt: NOW,
    }))
  );
  await db.insert(comments).values(
    ["approved", "rejected", "deleted"].map((packId) => ({
      id: `${packId}-comment`,
      packId,
      userId: "stranger",
      body: "Nice work",
      createdAt: NOW,
      updatedAt: NOW,
    }))
  );
});

describe("comments follow the pack's visibility", () => {
  it("anyone reads the comments of an approved pack", async () => {
    const response = await commentsOf("approved");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ comments: [{ id: "approved-comment" }] });
  });

  it("only the owner and moderators read the comments of a pack that is not approved", async () => {
    expect((await commentsOf("rejected")).status).toBe(404);
    expect((await commentsOf("rejected", stranger)).status).toBe(404);
    expect((await commentsOf("rejected", owner)).status).toBe(200);
    expect((await commentsOf("rejected", moderator)).status).toBe(200);
  });

  it("nobody reads the comments of a deleted pack", async () => {
    expect((await commentsOf("deleted")).status).toBe(404);
    expect((await commentsOf("deleted", owner)).status).toBe(404);
    expect((await commentsOf("deleted", moderator)).status).toBe(404);
  });
});

describe("votes follow the pack's visibility", () => {
  it("nobody but the owner and moderators reads the votes of a hidden pack", async () => {
    expect((await get("approved/vote")).status).toBe(200);
    expect((await get("rejected/vote", stranger)).status).toBe(404);
    expect((await get("rejected/vote", owner)).status).toBe(200);
    expect((await get("deleted/vote", moderator)).status).toBe(404);
  });
});

describe("reports follow the pack's visibility", () => {
  function report(targetType: "pack" | "comment", targetId: string) {
    return app.request(
      "/api/reports",
      {
        method: "POST",
        headers: { cookie: stranger, "content-type": "application/json" },
        body: JSON.stringify({ targetType, targetId, reason: "spam" }),
      },
      env,
      createExecutionContext()
    );
  }

  it("a hidden pack, or a comment on one, cannot be reported", async () => {
    expect((await report("pack", "approved")).status).toBe(200);
    expect((await report("pack", "rejected")).status).toBe(404);
    expect((await report("pack", "deleted")).status).toBe(404);
    expect((await report("comment", "rejected-comment")).status).toBe(404);
  });
});
