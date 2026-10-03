import { type Database, users } from "@vgskins/db";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { eq } from "drizzle-orm";
import { isModerator } from "./auth";
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
export function authPolicy(db: Database) {
  return createAuthMiddleware(async (ctx) => {
    if (DISABLED_ENDPOINTS.has(ctx.path)) {
      throw new APIError("NOT_FOUND");
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
