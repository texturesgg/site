import type { AuthUser } from "./auth";

/**
 * Whether Flagship turns code mods on for `user` (the `code-mods` flag, whose
 * rules can match the user id or role). Off for anyone signed out. The
 * binding answers the default itself if it can't evaluate.
 */
export function codeModsEnabled(flags: Flagship, user: AuthUser | null): Promise<boolean> {
  if (!user) return Promise.resolve(false);
  return flags.getBooleanValue("code-mods", false, { userId: `user:${user.id}`, role: user.role });
}
