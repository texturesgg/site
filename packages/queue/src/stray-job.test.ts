import { createMessageBatch, env } from "cloudflare:test";
import { createDb, games, packs, targets, users } from "@vgskins/db";
import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import worker from "./index";

const db = createDb(env.DB);

it("a job for a pack that is not waiting on it changes nothing, even when it exhausts", async () => {
  const now = new Date();
  await db.insert(users).values({
    id: "owner",
    name: "owner",
    email: "owner@example.com",
    createdAt: now,
    updatedAt: now,
  });
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
  await db.insert(packs).values({
    id: "approved",
    userId: "owner",
    gameId: "game",
    targetId: "fox",
    title: "Approved",
    slug: "approved",
    status: "approved",
    imageProcessingStatus: "succeeded",
    thumbnailKey: "packs/approved/images/0",
    createdAt: now,
    updatedAt: now,
  });

  // A duplicate image job on its last attempt; its raw image is long gone.
  const batch = createMessageBatch("vgskins-processing", [
    {
      id: "message",
      timestamp: now,
      attempts: 6,
      body: {
        type: "optimize_images",
        packId: "approved",
        imageKeys: ["packs/approved/images/0.png"],
      },
    },
  ]);
  await worker.queue(batch, env);

  expect(await db.query.packs.findFirst({ where: eq(packs.id, "approved") })).toMatchObject({
    status: "approved",
    imageProcessingStatus: "succeeded",
    imageProcessingError: null,
    thumbnailKey: "packs/approved/images/0",
  });
});
