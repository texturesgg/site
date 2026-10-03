import { createDb, games, packs } from "@vgskins/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import type { HonoEnv } from "../types";

const app = new Hono<HonoEnv>().get("/", async (c) => {
  const db = createDb(c.env.DB);

  const [packCount, creatorCount, gameCount] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)` })
      .from(packs)
      .where(and(eq(packs.status, "approved"), isNull(packs.deletedAt)))
      .then((r) => r[0]?.count ?? 0),
    db
      .select({ count: sql<number>`count(distinct ${packs.userId})` })
      .from(packs)
      .where(and(eq(packs.status, "approved"), isNull(packs.deletedAt)))
      .then((r) => r[0]?.count ?? 0),
    db
      .select({ count: sql<number>`count(*)` })
      .from(games)
      .then((r) => r[0]?.count ?? 0),
  ]);

  return c.json({ packCount, creatorCount, gameCount }, 200);
});

export default app;
