import { type Database, users } from "@vgskins/db";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { eq } from "drizzle-orm";
import { isModerator } from "./auth";
import type { Env } from "../types";
import {
  TWO_FACTOR_REQUIRED,
  TWO_FACTOR_VERIFY_PATHS,
  TwoFactorSession,
  twoFactorRequired,
  twoFactorVerified,
} from "./two-factor";
import { usernameError } from "./username";

// Admin plugin endpoints the product does not use. Impersonation writes a
// session column the schema lacks, and removing a user cascades through the
// database without the R2 cleanup the ban purge performs.
const DISABLED_ENDPOINTS = new Set(["/admin/impersonate-user", "/admin/remove-user"]);
const BAN_ENDPOINTS = new Set(["/admin/ban-user", "/admin/unban-user"]);

/**
 * better-auth `hooks.before`: the product's rules for the endpoints
 * better-auth serves itself. A refusal is an APIError, which better-auth
 * answers as `{ message }` with its status.
 */
export function authPolicy(db: Database, env: Pick<Env, "MODERATOR_TWO_FACTOR">) {
  return createAuthMiddleware(async (ctx) => {
    if (DISABLED_ENDPOINTS.has(ctx.path)) {
      throw new APIError("NOT_FOUND");
    }

    // better-auth's own admin endpoints (roles, bans) need a verified session,
    // as admin.ts's routes do. Once an account has two-factor sign-in, so do
    // its settings (turning it off, a new secret, new backup codes), so a
    // stolen session can't swap in its own authenticator.
    const admin = ctx.path.startsWith("/admin/");
    const twoFactorSettings =
      ctx.path.startsWith("/two-factor/") && !TWO_FACTOR_VERIFY_PATHS.has(ctx.path);
    if ((admin || twoFactorSettings) && twoFactorRequired(env)) {
      const found = await getSessionFromCtx(ctx);
      const session = found && TwoFactorSession.parse(found);
      if (session && !twoFactorVerified(session.user, session.session)) {
        if (admin || session.user.twoFactorEnabled === true) {
          throw new APIError("FORBIDDEN", { message: TWO_FACTOR_REQUIRED.error });
        }
      }
    }

    if (ctx.path === "/update-user") {
      const body: Record<string, unknown> = ctx.body ?? {};
      if (body.name !== undefined) {
        const session = await getSessionFromCtx(ctx);
        const error = session && (await usernameError(db, body.name, session.user));
        if (error) throw new APIError("BAD_REQUEST", { message: error });
      }
      if (body.image !== undefined && body.image !== null && !isWebUrl(body.image)) {
        throw new APIError("BAD_REQUEST", { message: "Image must be an http or https URL" });
      }
    }

    // The role table already keeps moderators off these endpoints; this keeps
    // staff from banning one another whatever the role table says.
    if (BAN_ENDPOINTS.has(ctx.path)) {
      // better-auth coerces a non-string id after this hook, so checking only
      // strings would let `["id"]` through unchecked.
      if (typeof ctx.body?.userId !== "string") {
        throw new APIError("BAD_REQUEST", { message: "userId must be a string" });
      }
      const target = await db.query.users.findFirst({
        where: eq(users.id, ctx.body.userId),
        columns: { role: true },
      });
      if (isModerator(target)) {
        throw new APIError("FORBIDDEN", { message: "Moderators and admins cannot be banned" });
      }
    }
  });
}

function isWebUrl(value: unknown): boolean {
  if (typeof value !== "string" || !URL.canParse(value)) return false;
  const { protocol } = new URL(value);
  return protocol === "https:" || protocol === "http:";
}
