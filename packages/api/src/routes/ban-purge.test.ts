import { createExecutionContext, env } from "cloudflare:test";
import { createDb, sessions } from "@vgskins/db";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { signIn } from "../test/session";
import type { HonoEnv } from "../types";
import adminRoutes from "./admin";
import usersRoutes from "./users";

const db = createDb(env.DB);
const app = new Hono<HonoEnv>().route("/api/users", usersRoutes).route("/api/admin", adminRoutes);

function request(path: string, cookie: string, init: RequestInit = {}) {
  return app.request(
    path,
    { ...init, headers: { ...init.headers, cookie } },
    env,
    createExecutionContext()
  );
}

describe("ban and purge", () => {
  it("signs the banned user out and keeps them out", async () => {
    const admin = await signIn(db, "admin", "admin");
    const target = await signIn(db, "target");
    expect((await request("/api/users/me", target)).status).toBe(200);

    const banned = await request("/api/admin/users/target/ban-purge", admin, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(banned.status).toBe(200);
    expect(await db.query.sessions.findMany({ where: eq(sessions.userId, "target") })).toEqual([]);
    expect((await request("/api/users/me", target)).status).toBe(401);

    // A session that outlives the ban, however it came to exist, is refused too.
    const now = new Date();
    await db.insert(sessions).values({
      id: "target-session",
      userId: "target",
      token: "target-session-token",
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
      createdAt: now,
      updatedAt: now,
    });
    expect((await request("/api/users/me", target)).status).toBe(401);
    expect((await request("/api/users/me", admin)).status).toBe(200);
  });
});
