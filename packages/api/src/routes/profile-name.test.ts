import { createExecutionContext, env } from "cloudflare:test";
import { createDb, users } from "@vgskins/db";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { beforeAll, expect, it } from "vitest";
import { authHandler } from "../lib/auth";
import { signIn } from "../test/session";
import type { HonoEnv } from "../types";

const db = createDb(env.DB);
const app = new Hono<HonoEnv>().all("/api/auth/*", authHandler);
let cookie: string;

beforeAll(async () => {
  cookie = await signIn(db, "renamer");
  await signIn(db, "taken");
});

function updateUser(body: Record<string, unknown>) {
  return app.request(
    "/api/auth/update-user",
    {
      method: "POST",
      headers: { cookie, "content-type": "application/json", origin: "http://localhost:5174" },
      body: JSON.stringify(body),
    },
    env,
    createExecutionContext()
  );
}

it("better-auth's update-user applies the profile name rules", async () => {
  for (const [name, error] of [
    ["<b>a</b>", "Username can only contain letters, numbers, underscores, and hyphens"],
    ["admin", "This username is reserved"],
    ["taken", "Name already taken"],
  ]) {
    const response = await updateUser({ name });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ message: error });
  }
  expect((await updateUser({ image: "javascript:alert(1)" })).status).toBe(400);

  const renamed = await updateUser({ name: "new-name", image: "https://example.com/a.png" });
  expect(renamed.status).toBe(200);
  const row = await db.query.users.findFirst({ where: eq(users.id, "renamer") });
  expect(row).toMatchObject({ name: "new-name", image: "https://example.com/a.png" });
});
