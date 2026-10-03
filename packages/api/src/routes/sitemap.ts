import { Hono } from "hono";
import { getPublicSitemapData } from "../lib/public-catalog";
import type { HonoEnv } from "../types";

const app = new Hono<HonoEnv>().get("/", async (c) => {
  const data = await getPublicSitemapData(c.env);
  c.header("Cache-Control", "public, max-age=3600, s-maxage=3600");
  return c.json(data, 200);
});

export default app;
