import { createExecutionContext, env } from "cloudflare:test";
import { createDb } from "@vgskins/db";
import { Hono } from "hono";
import { beforeAll, expect, it } from "vitest";
import { signIn } from "../test/session";
import type { HonoEnv } from "../types";
import usersRoutes from "./users";

// A profile's support links: each known service at most once, on that
// service's own host over https, plus one labeled `other` link. Visitors see
// them on the profile.
const db = createDb(env.DB);
const app = new Hono<HonoEnv>().route("/api/users", usersRoutes);
let maker: string;

function request(path: string, init: RequestInit = {}) {
  return app.request(`/api/users${path}`, init, env, createExecutionContext());
}

function save(supportLinks: unknown) {
  return request("/me", {
    method: "PUT",
    headers: { cookie: maker, "content-type": "application/json" },
    body: JSON.stringify({ supportLinks }),
  });
}

async function profileLinks() {
  return ((await (await request("/maker")).json()) as { supportLinks: unknown }).supportLinks;
}

beforeAll(async () => {
  maker = await signIn(db, "maker");
});

it("saves support links on the service's own host and shows them on the profile", async () => {
  const links = [
    { kind: "kofi", url: "https://ko-fi.com/maker" },
    { kind: "patreon", url: "https://www.patreon.com/maker" },
    { kind: "github-sponsors", url: "https://github.com/sponsors/maker" },
    { kind: "youtube", url: "https://www.youtube.com/@maker" },
    { kind: "twitch", url: "https://twitch.tv/maker" },
    { kind: "other", label: "My shop", url: "https://shop.example.com/" },
  ];
  expect((await save(links)).status).toBe(200);
  expect(await profileLinks()).toEqual(links);

  for (const refused of [
    [{ kind: "kofi", url: "https://ko-fi.com.evil.example/maker" }],
    [{ kind: "kofi", url: "https://evil.example/ko-fi.com" }],
    [{ kind: "patreon", url: "http://patreon.com/maker" }],
    [{ kind: "twitch", url: "https://user:pass@twitch.tv/maker" }],
    [{ kind: "github-sponsors", url: "https://github.com/maker" }],
    [{ kind: "youtube", url: "javascript:alert(1)" }],
    [{ kind: "other", url: "https://shop.example.com/" }],
    [{ kind: "other", label: "x".repeat(41), url: "https://shop.example.com/" }],
    [
      { kind: "kofi", url: "https://ko-fi.com/maker" },
      { kind: "kofi", url: "https://ko-fi.com/other" },
    ],
    [{ kind: "paypal", url: "https://paypal.me/maker" }],
  ]) {
    expect((await save(refused)).status, JSON.stringify(refused)).toBe(400);
  }
  expect(await profileLinks()).toEqual(links);
});
