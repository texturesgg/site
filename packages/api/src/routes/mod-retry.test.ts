import { createExecutionContext, env } from "cloudflare:test";
import { createDb, games, mods, packs, targetSlots, targets } from "@vgskins/db";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { expect, it, vi } from "vitest";
import { signIn } from "../test/session";
import type { HonoEnv } from "../types";
import packsRoutes from "./packs";

const db = createDb(env.DB);
const app = new Hono<HonoEnv>().route("/api/packs", packsRoutes);

it("replacing a failed mod file stores it and queues it for validation again", async () => {
  const owner = await signIn(db, "owner");
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
  await db.insert(packs).values({
    id: "pack",
    userId: "owner",
    gameId: "game",
    targetId: "fox",
    title: "Pack",
    slug: "pack",
    status: "corrupted",
    expectedModCount: 1,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(mods).values({
    id: "mod",
    packId: "pack",
    slotId: "slot",
    fileKey: "packs/pack/mods/mod/PlFxNr.dat",
    fileName: "PlFxNr.dat",
    createdAt: now,
    processingStatus: "failed",
    processingError: "Invalid DAT file",
  });
  const send = vi.spyOn(env.PROCESSING_QUEUE, "send");

  const form = new FormData();
  form.set("file", new File([new Uint8Array(32)], "PlFxNr.dat"));
  const response = await app.request(
    "/api/packs/by-id/pack/mods/mod/retry",
    { method: "POST", headers: { cookie: owner }, body: form },
    env,
    createExecutionContext()
  );

  expect(response.status).toBe(200);
  const mod = await db.query.mods.findFirst({ where: eq(mods.id, "mod") });
  expect(mod).toMatchObject({ processingStatus: "queued", processingError: null });
  expect((await env.BUCKET.head(mod!.fileKey))?.size).toBe(32);
  expect(await db.query.packs.findFirst({ where: eq(packs.id, "pack") })).toMatchObject({
    status: "processing",
  });
  expect(send.mock.calls[0]?.[0]).toMatchObject({
    type: "process_dat",
    modId: "mod",
    packId: "pack",
  });
});
