import { createExecutionContext, env } from "cloudflare:test";
import { createDb } from "@vgskins/db";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { authHandler, CLI_CLIENT_ID } from "../lib/auth";
import { signIn } from "../test/session";
import type { HonoEnv } from "../types";
import usersRoutes from "./users";

const db = createDb(env.DB);
const app = new Hono<HonoEnv>().route("/api/users", usersRoutes).all("/api/auth/*", authHandler);

function request(path: string, init: RequestInit = {}) {
  return app.request(path, init, env, createExecutionContext());
}

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return request(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

async function requestCode() {
  const res = await post("/api/auth/device/code", { client_id: CLI_CLIENT_ID });
  expect(res.status).toBe(200);
  return (await res.json()) as { device_code: string; user_code: string };
}

function poll(deviceCode: string) {
  return post("/api/auth/device/token", {
    grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    device_code: deviceCode,
    client_id: CLI_CLIENT_ID,
  });
}

// The site's /device page looks the code up as the signed-in user, which
// claims it for them, then approves it from the site's origin.
async function approve(userCode: string, cookie: string) {
  const lookup = await request(`/api/auth/device?user_code=${userCode}`, { headers: { cookie } });
  expect(lookup.status).toBe(200);
  return post(
    "/api/auth/device/approve",
    { userCode },
    { cookie, origin: "http://localhost:5174" }
  );
}

describe("signing in the command line", () => {
  it("gives a token for the user who approves its code, usable as a bearer token", async () => {
    const cookie = await signIn(db, "cli-user");
    const { device_code, user_code } = await requestCode();

    const pending = await poll(device_code);
    expect(pending.status).toBe(400);
    expect(await pending.json()).toMatchObject({ error: "authorization_pending" });

    expect((await approve(user_code, cookie)).status).toBe(200);
    // The poll above set the interval clock; a token request waits it out.
    await new Promise((resolve) => setTimeout(resolve, 5_100));
    const granted = await poll(device_code);
    expect(granted.status).toBe(200);
    const { access_token } = (await granted.json()) as { access_token: string };

    const me = await request("/api/users/me", {
      headers: { authorization: `Bearer ${access_token}` },
    });
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ id: "cli-user" });
  }, 15_000);

  it("lets only the user who looked the code up approve it", async () => {
    const owner = await signIn(db, "code-owner");
    const other = await signIn(db, "other-user");
    const { user_code } = await requestCode();
    const lookup = await request(`/api/auth/device?user_code=${user_code}`, {
      headers: { cookie: owner },
    });
    expect(lookup.status).toBe(200);

    expect((await approve(user_code, other)).status).toBe(403);
    expect((await approve(user_code, owner)).status).toBe(200);
  });

  it("refuses another client id", async () => {
    const res = await post("/api/auth/device/code", { client_id: "something-else" });
    expect(res.status).toBe(400);
  });
});
