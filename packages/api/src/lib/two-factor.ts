import { type Database, sessions } from "@vgskins/db";
import { TWO_FACTOR_REQUIRED_CODE, type TwoFactorRefusal } from "@vgskins/shared";
import { createAuthMiddleware } from "better-auth/api";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Env } from "../types";

// Two-factor sign-in for moderators and admins (better-auth's twoFactor
// plugin). better-auth asks for the code only on email sign-in, so a Discord
// or `tgg login` session never proves it. What counts is the session: one
// that verified a code (at email sign-in, or later on the site) carries
// `twoFactorAt`, and moderator and admin actions need it.

/** What a moderator or admin action answers without a verified session. */
export const TWO_FACTOR_REQUIRED: TwoFactorRefusal = {
  error: "Moderating needs two-factor sign-in. Open Moderation to turn it on or enter your code.",
  code: TWO_FACTOR_REQUIRED_CODE,
};

/** Whether moderating needs it: on every deploy, off for local development
 * (wrangler.toml MODERATOR_TWO_FACTOR). */
export function twoFactorRequired(env: Pick<Env, "MODERATOR_TWO_FACTOR">): boolean {
  return env.MODERATOR_TWO_FACTOR !== "off";
}

/** Whether this session proved the account's second factor. */
export function twoFactorVerified(
  user: { twoFactorEnabled?: boolean | null },
  session: { twoFactorAt?: Date | null }
): boolean {
  return user.twoFactorEnabled === true && session.twoFactorAt != null;
}

// The endpoints that check a code; the session they answer with is verified
export const TWO_FACTOR_VERIFY_PATHS = new Set([
  "/two-factor/verify-totp",
  "/two-factor/verify-backup-code",
]);

/** The fields of a session better-auth hands its hooks untyped */
export const TwoFactorSession = z.object({
  user: z.object({ twoFactorEnabled: z.boolean().nullish() }),
  session: z.object({ twoFactorAt: z.coerce.date().nullish() }),
});

const Verified = z.object({ token: z.string().min(1) });

/**
 * better-auth `hooks.after`: marks the session a code was verified on. That
 * is the one it created when there is one: the email sign-in's, or the
 * replacement when the code turned two-factor sign-in on (better-auth
 * answers then with the old, deleted session's token).
 */
export function markTwoFactorSession(db: Database) {
  return createAuthMiddleware(async (ctx) => {
    if (!TWO_FACTOR_VERIFY_PATHS.has(ctx.path)) return;
    const verified = Verified.safeParse(ctx.context.returned);
    if (!verified.success) return;
    const token = ctx.context.newSession?.session.token ?? verified.data.token;
    await db.update(sessions).set({ twoFactorAt: new Date() }).where(eq(sessions.token, token));
  });
}
