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

it("an upload waits in processing with a queued job for each mod and for its images", async () => {
  const uploader = await signIn(db, "uploader");
  const now = new Date();
  await db.insert(games).values({
    id: "game",
    name: "Super Smash Bros. Melee",
    slug: "melee",
    shortName: "Melee",
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(targets).values({
    id: "target",
    gameId: "game",
    name: "Fox",
    slug: "fox",
    category: "character",
  });
  await db.insert(targetSlots).values({ id: "slot", targetId: "target", name: "Neutral" });

  // The spy records the batch and still publishes it to the local queue.
  const sendBatch = vi.spyOn(env.PROCESSING_QUEUE, "sendBatch");

  // The route stores files without reading them; the queue Worker validates them.
  const form = new FormData();
  form.set("title", "Example pack");
  form.set("gameId", "game");
  form.set("targetId", "target");
  form.append("modFiles[]", new File([new Uint8Array(32)], "PlFxNr.dat"));
  form.append("modSlotIds[]", "slot");
  form.append("modLabels[]", "Neutral");
  form.append("images", new File([new Uint8Array(8)], "preview.png", { type: "image/png" }));
  const response = await app.request(
    "/api/packs",
    { method: "POST", headers: { cookie: uploader }, body: form },
    env,
    createExecutionContext()
  );
  expect(response.status).toBe(200);
  const { id } = await response.json<{ id: string }>();

  expect(await db.query.packs.findFirst({ where: eq(packs.id, id) })).toMatchObject({
    status: "processing",
    expectedModCount: 1,
    imageProcessingStatus: "pending",
  });
  const [mod, ...otherMods] = await db.query.mods.findMany({ where: eq(mods.packId, id) });
  expect(otherMods).toEqual([]);
  expect(mod).toMatchObject({ processingStatus: "queued" });

  expect(sendBatch).toHaveBeenCalledTimes(1);
  expect(sendBatch.mock.calls[0]?.[0]).toEqual([
    {
      body: { type: "process_dat", modId: mod?.id, packId: id, correlationId: expect.any(String) },
    },
    {
      body: {
        type: "optimize_images",
        packId: id,
        imageKeys: [`packs/${id}/images/0.png`],
        correlationId: expect.any(String),
      },
    },
  ]);
});
