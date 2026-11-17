import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { createDb, users } from "@vgskins/db";
import { twoFactorRefusalSchema } from "@vgskins/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { authHandler } from "../lib/auth";
import { signIn } from "../test/session";
import type { HonoEnv } from "../types";
import adminRoutes from "./admin";

// Moderator and admin actions need two-factor sign-in on every deploy: the
// account has it, and the session proved it with a code. A Discord or
// `tgg login` session never did, so it can't moderate, and a stolen session
// can't turn the second factor off or swap in its own.
const db = createDb(env.DB);
const app = new Hono<HonoEnv>().route("/api/admin", adminRoutes).all("/api/auth/*", authHandler);
// Local development turns the requirement off; every deploy has it on.
const deployed = { ...env, MODERATOR_TWO_FACTOR: "required" };

async function request(path: string, cookie: string, init: RequestInit = {}) {
  const ctx = createExecutionContext();
  const response = await app.request(
    path,
    {
      ...init,
      headers: {
        ...init.headers,
        cookie,
        "content-type": "application/json",
        origin: "http://localhost:5174",
      },
    },
    deployed,
    ctx
  );
  await waitOnExecutionContext(ctx);
  return response;
}

function post(path: string, cookie: string, body: unknown = {}) {
  return request(path, cookie, { method: "POST", body: JSON.stringify(body) });
}

const Enabled = z.object({ totpURI: z.string(), backupCodes: z.array(z.string()) });

/** The authenticator app's code for `uri` now (RFC 6238: SHA-1, 30 s, 6 digits). */
async function totp(uri: string) {
  const secret = new URL(uri).searchParams.get("secret") ?? "";
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of secret.replace(/=+$/, "")) {
    bits += alphabet.indexOf(char).toString(2).padStart(5, "0");
  }
  const key = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < key.length; i++) key[i] = Number.parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  const counter = new DataView(new ArrayBuffer(8));
  counter.setBigUint64(0, BigInt(Math.floor(Date.now() / 30_000)));
  const hmacKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", hmacKey, counter.buffer));
  const offset = (mac.at(-1) ?? 0) & 0xf;
  const view = new DataView(mac.buffer, offset, 4);
  return String((view.getUint32(0) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

describe("two-factor sign-in for moderators", () => {
  it("refuses a moderator without it, and one whose session didn't prove it", async () => {
    const none = await signIn(db, "2fa-none", "moderator", { twoFactor: false });
    const refused = await request("/api/admin/stats", none);
    expect(refused.status).toBe(403);
    expect(twoFactorRefusalSchema.safeParse(await refused.json()).success).toBe(true);

    const verified = await signIn(db, "2fa-verified", "moderator");
    expect((await request("/api/admin/stats", verified)).status).toBe(200);
  });

  it("lets a moderator turn it on, and the session that verified the code moderate", async () => {
    const cookie = await signIn(db, "2fa-enroll", "moderator", { twoFactor: false });
    expect((await request("/api/admin/stats", cookie)).status).toBe(403);

    const enabled = await post("/api/auth/two-factor/enable", cookie);
    expect(enabled.status).toBe(200);
    const { totpURI, backupCodes } = Enabled.parse(await enabled.json());
    expect(backupCodes.length).toBeGreaterThan(0);

    expect(
      (await post("/api/auth/two-factor/verify-totp", cookie, { code: "000000" })).status
    ).toBe(401);
    const verified = await post("/api/auth/two-factor/verify-totp", cookie, {
      code: await totp(totpURI),
    });
    expect(verified.status).toBe(200);
    // Turning it on replaces the session; the new one is verified
    const renewed = verified.headers.get("set-cookie")?.split(";")[0] ?? "";
    expect(renewed).toMatch(/session_token=/);
    expect((await request("/api/admin/stats", renewed)).status).toBe(200);
    expect((await request("/api/admin/stats", cookie)).status).toBe(401);
  });

  it("keeps an unverified session from turning it off or replacing it", async () => {
    const cookie = await signIn(db, "2fa-stolen", "moderator", { twoFactor: false });
    // The account has it; this session (say, a Discord sign-in) never proved it
    await db.update(users).set({ twoFactorEnabled: true }).where(eq(users.id, "2fa-stolen"));

    expect((await post("/api/auth/two-factor/disable", cookie)).status).toBe(403);
    expect((await post("/api/auth/two-factor/enable", cookie)).status).toBe(403);
    expect((await post("/api/auth/two-factor/generate-backup-codes", cookie)).status).toBe(403);
  });

  it("guards better-auth's own admin endpoints the same way", async () => {
    const unverified = await signIn(db, "2fa-admin-none", "admin", { twoFactor: false });
    await signIn(db, "2fa-target", "user");
    const setRole = (cookie: string) =>
      post("/api/auth/admin/set-role", cookie, { userId: "2fa-target", role: "moderator" });
    expect((await setRole(unverified)).status).toBe(403);

    const verified = await signIn(db, "2fa-admin", "admin");
    expect((await setRole(verified)).status).toBe(200);
  });
});
