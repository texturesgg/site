import { Hono } from "hono";
import { requireAuth } from "../lib/auth";
import { mintMeetTicket } from "../lib/meet-ticket";
import type { HonoEnv } from "../types";

const app = new Hono<HonoEnv>()
  // A ticket for the meeting point, for the signed-in player. `tgg account
  // ticket meet` asks for it with the saved sign-in and hands it to the game.
  .post("/ticket", requireAuth, async (c) => {
    const user = c.get("user");
    const { ticket, expires } = await mintMeetTicket(c.env.BETTER_AUTH_SECRET, user.id);
    return c.json({ ticket, name: user.name, expires }, 200);
  });

export default app;
