import { createExecutionContext, env } from "cloudflare:test";
import { comments, createDb, games, packs, reports, targets } from "@vgskins/db";
import { Hono } from "hono";
import { expect, it } from "vitest";
import { signIn } from "../test/session";
import type { HonoEnv } from "../types";
import packsRoutes from "./packs";

const db = createDb(env.DB);
const app = new Hono<HonoEnv>().route("/api/packs", packsRoutes);

it("deleting a comment deletes its replies and dismisses the reports left on them", async () => {
  const author = await signIn(db, "author");
  await signIn(db, "replier");
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
    userId: "author",
    gameId: "game",
    targetId: "fox",
    title: "Pack",
    slug: "pack",
    status: "approved",
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(comments).values(
    [
      ["parent", "author", null],
      ["reply", "replier", "parent"],
      ["other", "replier", null],
    ].map(([id, userId, parentId]) => ({
      id: id!,
      packId: "pack",
      userId: userId!,
      parentId,
      body: id!,
      createdAt: now,
      updatedAt: now,
    }))
  );
  await db.insert(reports).values(
    ["parent", "reply", "other"].map((targetId) => ({
      id: `report-${targetId}`,
      reporterId: "replier",
      targetType: "comment" as const,
      targetId,
      reason: "spam" as const,
      createdAt: now,
    }))
  );

  const response = await app.request(
    "/api/packs/by-id/pack/comments/parent",
    { method: "DELETE", headers: { cookie: author } },
    env,
    createExecutionContext()
  );

  expect(response.status).toBe(200);
  expect((await db.query.comments.findMany()).map((comment) => comment.id)).toEqual(["other"]);
  const statuses = await db.query.reports.findMany({ columns: { id: true, status: true } });
  expect(statuses.sort((a, b) => a.id.localeCompare(b.id))).toEqual([
    { id: "report-other", status: "pending" },
    { id: "report-parent", status: "dismissed" },
    { id: "report-reply", status: "dismissed" },
  ]);
});
