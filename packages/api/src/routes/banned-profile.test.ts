import { createExecutionContext, env } from "cloudflare:test";
import { createDb, users } from "@vgskins/db";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { beforeAll, expect, it } from "vitest";
import { getUserOpenGraphData } from "../lib/public-catalog";
import { signIn } from "../test/session";
import type { HonoEnv } from "../types";
import usersRoutes from "./users";

const db = createDb(env.DB);
const app = new Hono<HonoEnv>().route("/api/users", usersRoutes);

beforeAll(async () => {
  await signIn(db, "banned-user");
  await signIn(db, "ban-served");
  const hour = 60 * 60 * 1000;
  await db
    .update(users)
    .set({ banned: true, banExpires: new Date(Date.now() + hour) })
    .where(eq(users.id, "banned-user"));
  await db
    .update(users)
    .set({ banned: true, banExpires: new Date(Date.now() - hour) })
    .where(eq(users.id, "ban-served"));
});

const profile = (identifier: string) =>
  app.request(`/api/users/${identifier}`, {}, env, createExecutionContext());

it("a user is hidden while a ban is in force", async () => {
  expect((await profile("banned-user")).status).toBe(404);
  expect((await profile("banned-user/uploads")).status).toBe(404);
  expect(await getUserOpenGraphData(env, "banned-user")).toBeNull();

  expect((await profile("ban-served")).status).toBe(200);
  expect(await getUserOpenGraphData(env, "ban-served")).toMatchObject({ name: "ban-served" });
});
