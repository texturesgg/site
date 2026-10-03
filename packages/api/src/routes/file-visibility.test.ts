import { createExecutionContext, env } from "cloudflare:test";
import { createDb, games, packs, targets } from "@vgskins/db";
import { Hono } from "hono";
import { beforeAll, expect, it } from "vitest";
import { signIn } from "../test/session";
import type { HonoEnv } from "../types";
import filesRoutes from "./files";

const db = createDb(env.DB);
const NOW = new Date();
const app = new Hono<HonoEnv>().route("/api/files", filesRoutes);
const cookies: Record<string, string> = {};
const PACKS = ["approved", "pending", "rejected", "deleted"] as const;

beforeAll(async () => {
  cookies.owner = await signIn(db, "owner");
  cookies.stranger = await signIn(db, "stranger");
  cookies.moderator = await signIn(db, "moderator", "moderator");
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
    PACKS.map((id) => ({
      id,
      userId: "owner",
      gameId: "game",
      targetId: "fox",
      title: id,
      slug: id,
      status: id === "deleted" ? ("approved" as const) : id,
      deletedAt: id === "deleted" ? NOW : null,
      createdAt: NOW,
      updatedAt: NOW,
    }))
  );
  for (const id of PACKS) await env.BUCKET.put(`packs/${id}/mods/mod/PlFxNr.dat`, id);
});

// Who may fetch a pack's files: whoever may see the pack.
const VIEWERS = ["anonymous", "stranger", "owner", "moderator"];
const visible: Record<string, string[]> = {
  approved: VIEWERS,
  pending: ["owner", "moderator"],
  rejected: ["owner", "moderator"],
  deleted: [],
};

it.each(PACKS.flatMap((pack) => VIEWERS.map((viewer) => [pack, viewer])))(
  "a %s pack's file, fetched by %s",
  async (pack, viewer) => {
    const response = await app.request(
      `/api/files/packs/${pack}/mods/mod/PlFxNr.dat`,
      { headers: cookies[viewer] ? { cookie: cookies[viewer] } : {} },
      env,
      createExecutionContext()
    );
    if (!visible[pack].includes(viewer)) {
      expect(response.status).toBe(404);
      return;
    }
    expect(response.status).toBe(200);
    expect(new TextDecoder().decode(await response.arrayBuffer())).toBe(pack);
    expect(response.headers.get("cache-control")).toBe(
      pack === "approved" ? "public, max-age=31536000, immutable" : "private, no-store"
    );
  }
);
