import { env } from "cloudflare:workers";
import { type Database, sessions, users } from "@vgskins/db";
import type { UserRole } from "@vgskins/shared";

// better-auth's session cookie is the session token and its HMAC-SHA256 under
// the auth secret.
export async function sessionCookie(token: string) {
  const encode = (value: string) => new TextEncoder().encode(value);
  const key = await crypto.subtle.importKey(
    "raw",
    encode(env.BETTER_AUTH_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = Buffer.from(await crypto.subtle.sign("HMAC", key, encode(token)));
  return `better-auth.session_token=${encodeURIComponent(`${token}.${signature.toString("base64")}`)}`;
}

/**
 * Insert a user with a live session and return that session's cookie. A
 * moderator or admin has two-factor sign-in and a session that proved it,
 * unless `twoFactor` is false.
 */
export async function signIn(
  db: Database,
  id: string,
  role: UserRole = "user",
  { twoFactor = role !== "user" }: { twoFactor?: boolean } = {}
) {
  const now = new Date();
  const token = `${id}-session-token`;
  await db.insert(users).values({
    id,
    name: id,
    email: `${id}@example.com`,
    emailVerified: true,
    role,
    twoFactorEnabled: twoFactor,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(sessions).values({
    id: `${id}-session`,
    userId: id,
    token,
    expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
    twoFactorAt: twoFactor ? now : null,
    createdAt: now,
    updatedAt: now,
  });
  return sessionCookie(token);
}
