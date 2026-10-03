import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { createDb, games, packs, targets } from "@vgskins/db";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { beforeAll, expect, it, vi } from "vitest";
import { signIn } from "../test/session";
import type { HonoEnv } from "../types";
import adminRoutes from "./admin";

const db = createDb(env.DB);
const app = new Hono<HonoEnv>().route("/api/admin", adminRoutes);
const NOW = new Date();
let moderator: string;

beforeAll(async () => {
  moderator = await signIn(db, "moderator", "moderator");
  await signIn(db, "owner");
  await db.insert(games).values({
    id: "game",
    name: "Melee",
    slug: "melee",
    shortName: "Melee",
    createdAt: NOW,
    updatedAt: NOW,
  });
  await db
    .insert(targets)
    .values({ id: "fox", gameId: "game", name: "Fox", slug: "fox", category: "character" });
  await db.insert(packs).values(
    ["deleted", "contested", "rejected"].map((id) => ({
      id,
      userId: "owner",
      gameId: "game",
      targetId: "fox",
      title: id,
      slug: id,
      status: "pending" as const,
      deletedAt: id === "deleted" ? NOW : null,
      createdAt: NOW,
      updatedAt: NOW,
    }))
  );
});

// Delivery is answered here; the local Email Sending binding never settles in tests.
function emailOutbox() {
  const email = env.EMAIL;
  if (!email) throw new Error("wrangler.toml binds EMAIL");
  return vi.spyOn(email, "send").mockResolvedValue({ messageId: "sent" });
}

async function moderate(packId: string, action: "approve" | "reject" = "approve") {
  const ctx = createExecutionContext();
  const response = await app.request(
    `/api/admin/packs/${packId}/${action}`,
    { method: "POST", headers: { cookie: moderator } },
    env,
    ctx
  );
  await waitOnExecutionContext(ctx);
  return response.status;
}

it("a deleted pack cannot be approved, and its owner hears nothing", async () => {
  const send = emailOutbox();
  expect(await moderate("deleted")).toBe(409);
  expect(send).not.toHaveBeenCalled();
  const pack = await db.query.packs.findFirst({ where: eq(packs.id, "deleted") });
  expect(pack?.status).toBe("pending");
  send.mockRestore();
});

it("of two moderators approving at once, one wins and the owner is told once", async () => {
  const send = emailOutbox();
  const statuses = await Promise.all([moderate("contested"), moderate("contested")]);
  expect(statuses.sort()).toEqual([200, 409]);
  expect(send).toHaveBeenCalledTimes(1);
  send.mockRestore();
});

it("rejecting a pack deletes every object stored under it", async () => {
  const keys = [
    "packs/rejected/mods/mod/PlFxNr.dat",
    "packs/rejected/mods/mod/retry-abc.dat",
    "packs/rejected/images/0.png",
    "packs/rejected/images/1_sm.webp",
    "packs/rejected/images/1_md.webp",
    "packs/rejected/images/1_full.webp",
  ];
  for (const key of [...keys, "packs/contested/images/0_sm.webp"]) {
    await env.BUCKET.put(key, "bytes");
  }
  emailOutbox();

  expect(await moderate("rejected", "reject")).toBe(200);
  expect((await env.BUCKET.list({ prefix: "packs/rejected/" })).objects).toEqual([]);
  expect(await env.BUCKET.head("packs/contested/images/0_sm.webp")).not.toBeNull();
});
