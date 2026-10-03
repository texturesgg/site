import { zValidator } from "@hono/zod-validator";
import { createDb, tags } from "@vgskins/db";
import { asc } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { likeContains, sanitizeSearch, validationHook } from "../lib/validation";
import type { HonoEnv } from "../types";

const app = new Hono<HonoEnv>().get(
  "/",
  zValidator("query", z.object({ search: z.string().optional() }), validationHook),
  async (c) => {
    const db = createDb(c.env.DB);
    const query = c.req.valid("query");

    const search = sanitizeSearch(typeof query.search === "string" ? query.search : undefined);

    const conditions = [];
    if (search) {
      conditions.push(likeContains(tags.name, search));
    }

    const result = await db
      .select({
        id: tags.id,
        name: tags.name,
        slug: tags.slug,
      })
      .from(tags)
      .where(conditions.length > 0 ? conditions[0] : undefined)
      .orderBy(asc(tags.name))
      .limit(20);

    return c.json(result, 200);
  }
);

export default app;
