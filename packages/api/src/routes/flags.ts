import { Hono } from "hono";
import { optionalAuth } from "../lib/auth";
import { codeModsEnabled } from "../lib/feature-flags";
import type { HonoEnv } from "../types";

/** The flags the web app shows or hides things by, for the signed-in viewer. */
const app = new Hono<HonoEnv>().get("/me", optionalAuth, async (c) => {
  const codeMods = await codeModsEnabled(c.env.FLAGS, c.get("user"));
  c.header("Cache-Control", "private, no-store");
  return c.json({ codeMods });
});

export default app;
