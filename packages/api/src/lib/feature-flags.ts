import { createMiddleware } from "hono/factory";
import type { HonoEnv } from "../types";
import type { AuthUser } from "./auth";

/**
 * Whether Flagship turns code mods on for `user` (the `code-mods` flag, whose
 * rules can match the user id or role). Someone signed out is asked about with
 * the role `anonymous` and no user id, so a rule for everyone covers them. The
 * binding answers the default itself if it can't evaluate.
 */
export function codeModsEnabled(flags: Flagship, user: AuthUser | null): Promise<boolean> {
  if (!user) return flags.getBooleanValue("code-mods", false, { role: "anonymous" });
  return flags.getBooleanValue("code-mods", false, { userId: `user:${user.id}`, role: user.role });
}

/**
 * Returns 404 unless code mods are on for the viewer, so flagged routes read
 * as missing. Use after `optionalAuth` or `requireAuth`.
 */
export const requireCodeMods = createMiddleware<HonoEnv>(async (c, next) => {
  if (!(await codeModsEnabled(c.env.FLAGS, c.get("user")))) {
    return c.json({ error: "Not found" }, 404);
  }
  await next();
});
