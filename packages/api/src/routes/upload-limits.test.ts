import { createExecutionContext, env } from "cloudflare:test";
import { createDb, games, targetSlots, targets } from "@vgskins/db";
import { LIMITS } from "@vgskins/shared";
import { Hono } from "hono";
import { beforeAll, expect, it } from "vitest";
import { signIn } from "../test/session";
import type { HonoEnv } from "../types";
import packsRoutes from "./packs";

const db = createDb(env.DB);
const app = new Hono<HonoEnv>().route("/api/packs", packsRoutes);
let uploader: string;

beforeAll(async () => {
  uploader = await signIn(db, "uploader");
  const now = new Date();
  await db.insert(games).values({
    id: "game",
    name: "Melee",
    slug: "melee",
    shortName: "Melee",
    createdAt: now,
    updatedAt: now,
  });
  await db
    .insert(targets)
    .values({ id: "fox", gameId: "game", name: "Fox", slug: "fox", category: "character" });
  await db.insert(targetSlots).values({ id: "slot", targetId: "fox", name: "Neutral" });
});

function upload(...mods: File[]) {
  const form = new FormData();
  form.set("title", "Pack");
  form.set("gameId", "game");
  form.set("targetId", "fox");
  for (const mod of mods) {
    form.append("modFiles[]", mod);
    form.append("modSlotIds[]", "slot");
    form.append("modLabels[]", "Neutral");
  }
  return app.request(
    "/api/packs",
    { method: "POST", headers: { cookie: uploader }, body: form },
    env,
    createExecutionContext()
  );
}

it("an upload over the body limit is refused before it is read, leaving nothing", async () => {
  const response = await upload(
    new File([new Uint8Array(LIMITS.PACK_UPLOAD_BODY_MAX)], "PlFxNr.dat")
  );
  expect(response.status).toBe(413);
  expect(await db.query.packs.findMany()).toEqual([]);
  expect((await env.BUCKET.list()).objects).toEqual([]);
});

it("a DAT over the size limit is refused", async () => {
  const response = await upload(new File([new Uint8Array(LIMITS.FILE_SIZE_DAT + 1)], "PlFxNr.dat"));
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "Mod 1 file must be less than 8MB" });
});
