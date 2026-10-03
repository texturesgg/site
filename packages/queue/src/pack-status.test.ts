import { env } from "cloudflare:test";
import { createDb, games, mods, packs, targetSlots, targets, users } from "@vgskins/db";
import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { refreshPackProcessingStatus } from "./index";

const db = createDb(env.DB);

function packStatus() {
  return db.query.packs.findFirst({ where: eq(packs.id, "pack"), columns: { status: true } });
}

it("a pack leaves processing only when its last mod has succeeded", async () => {
  const now = new Date();
  await db.insert(users).values({
    id: "uploader",
    name: "uploader",
    email: "uploader@example.com",
    createdAt: now,
    updatedAt: now,
  });
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
  await db.insert(targetSlots).values([
    { id: "neutral", targetId: "target", name: "Neutral" },
    { id: "red", targetId: "target", name: "Red", sortOrder: 1 },
  ]);
  await db.insert(packs).values({
    id: "pack",
    userId: "uploader",
    gameId: "game",
    targetId: "target",
    title: "Pack",
    slug: "pack",
    status: "processing",
    expectedModCount: 2,
    imageProcessingStatus: "skipped",
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(mods).values(
    ["neutral", "red"].map((slotId) => ({
      id: slotId,
      packId: "pack",
      slotId,
      fileKey: `packs/pack/mods/${slotId}/mod.dat`,
      fileName: "mod.dat",
      createdAt: now,
      processingStatus: "queued" as const,
    }))
  );

  await db.update(mods).set({ processingStatus: "succeeded" }).where(eq(mods.id, "neutral"));
  await refreshPackProcessingStatus(db, "pack", env);
  await expect(packStatus()).resolves.toEqual({ status: "processing" });

  await db.update(mods).set({ processingStatus: "succeeded" }).where(eq(mods.id, "red"));
  await refreshPackProcessingStatus(db, "pack", env);
  await expect(packStatus()).resolves.toEqual({ status: "pending" });
});
