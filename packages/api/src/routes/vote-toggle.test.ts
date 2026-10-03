import { createExecutionContext, env } from "cloudflare:test";
import { createDb, games, packs, targets } from "@vgskins/db";
import { Hono } from "hono";
import { expect, it } from "vitest";
import { signIn } from "../test/session";
import type { HonoEnv } from "../types";
import packsRoutes from "./packs";

const db = createDb(env.DB);
const app = new Hono<HonoEnv>().route("/api/packs", packsRoutes);

it("two toggles at once both answer, and the count matches the outcome", async () => {
  const voter = await signIn(db, "voter");
  const now = new Date();
  await db.insert(games).values({
    id: "game",
    name: "Melee",
    slug: "melee",
    shortName: "Melee",
    createdAt: now,
    updatedAt: now,
  });
  await db
    .insert(targets)
    .values({ id: "fox", gameId: "game", name: "Fox", slug: "fox", category: "character" });
  await db.insert(packs).values({
    id: "pack",
    userId: "voter",
    gameId: "game",
    targetId: "fox",
    title: "Pack",
    slug: "pack",
    status: "approved",
    createdAt: now,
    updatedAt: now,
  });

  const toggle = () =>
    app.request(
      "/api/packs/by-id/pack/vote",
      { method: "POST", headers: { cookie: voter } },
      env,
      createExecutionContext()
    );
  const responses = await Promise.all([toggle(), toggle()]);

  expect(responses.map((response) => response.status)).toEqual([200, 200]);
  const bodies = await Promise.all(
    responses.map((response) => response.json<{ voted: boolean }>())
  );
  // One toggle voted and the other took the vote back.
  expect(bodies.map((body) => body.voted).sort()).toEqual([false, true]);
  expect(await db.query.votes.findMany()).toEqual([]);
});
