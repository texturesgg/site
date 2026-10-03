import { createExecutionContext, env } from "cloudflare:test";
import { createDb } from "@vgskins/db";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { authHandler } from "../lib/auth";
import { signIn } from "../test/session";
import type { HonoEnv } from "../types";
import usersRoutes from "./users";

const db = createDb(env.DB);
const app = new Hono<HonoEnv>().route("/api/users", usersRoutes).all("/api/auth/*", authHandler);

function request(path: string, cookie: string, init: RequestInit = {}) {
  return app.request(
    path,
    { ...init, headers: { ...init.headers, cookie } },
    env,
    createExecutionContext()
  );
}

function ban(cookie: string, userId: unknown) {
  return request("/api/auth/admin/ban-user", cookie, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:5174" },
    body: JSON.stringify({ userId }),
  });
}

describe("better-auth's ban endpoint", () => {
  it("refuses a moderator, so an admin cannot be banned by one", async () => {
    const moderator = await signIn(db, "moderator", "moderator");
    const admin = await signIn(db, "admin", "admin");

    expect((await ban(moderator, "admin")).status).toBe(403);
    expect((await request("/api/users/me", admin)).status).toBe(200);
  });

  it("refuses to ban staff, even for an admin", async () => {
    const admin = await signIn(db, "banning-admin", "admin");
    const moderator = await signIn(db, "banned-moderator", "moderator");

    expect((await ban(admin, "banned-moderator")).status).toBe(403);
    expect((await request("/api/users/me", moderator)).status).toBe(200);
  });

  it("refuses an id that is not a string, which would skip the staff check", async () => {
    const admin = await signIn(db, "array-admin", "admin");
    const moderator = await signIn(db, "array-moderator", "moderator");

    expect((await ban(admin, ["array-moderator"])).status).toBe(400);
    expect((await request("/api/users/me", moderator)).status).toBe(200);
  });
});
