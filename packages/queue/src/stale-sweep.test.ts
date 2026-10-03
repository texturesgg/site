import { env } from "cloudflare:test";
import { createDb, games, mods, packImages, packs, targetSlots, targets, users } from "@vgskins/db";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { refreshPackProcessingStatus } from "./index";
import {
  ABANDONED_CORRUPTED_AGE_MS,
  STALE_PROCESSING_AGE_MS,
  sweepAbandonedCorruptedPacks,
  sweepStaleProcessingPacks,
} from "./stale-sweep";

const db = createDb(env.DB);

// Every pack is checked with the same wall-clock time the cron sweep would use.
const SWEEP_NOW = new Date("2026-09-04T12:00:00.000Z");
const STALE_UPDATED_AT = new Date(SWEEP_NOW.getTime() - STALE_PROCESSING_AGE_MS - 60_000);
const FRESH_UPDATED_AT = new Date(SWEEP_NOW.getTime() - 60_000);
const STALE_TIMEOUT_MESSAGE = "Processing timed out before completion";

type ImageProcessingStatus = (typeof packs.$inferSelect)["imageProcessingStatus"];

type SeedPack = {
  id: string;
  updatedAt: Date;
  imageProcessingStatus: ImageProcessingStatus;
  imageProcessingError?: string | null;
  mods?: { id: string; processingStatus: "queued" | "processing" | "succeeded" | "failed" }[];
};

async function insertPack(seed: SeedPack) {
  await db.insert(packs).values({
    id: seed.id,
    userId: "user-1",
    gameId: "game-1",
    targetId: "target-1",
    title: `Pack ${seed.id}`,
    slug: seed.id,
    status: "processing",
    expectedModCount: seed.mods?.length ?? 0,
    imageProcessingStatus: seed.imageProcessingStatus,
    imageProcessingError: seed.imageProcessingError ?? null,
    createdAt: STALE_UPDATED_AT,
    updatedAt: seed.updatedAt,
  });
  if (seed.mods) {
    await db.insert(mods).values(
      seed.mods.map((mod) => ({
        id: mod.id,
        packId: seed.id,
        slotId: "slot-1",
        fileKey: `${mod.id}.dat`,
        fileName: `${mod.id}.dat`,
        createdAt: STALE_UPDATED_AT,
        processingStatus: mod.processingStatus,
      }))
    );
  }
}

function getPack(id: string) {
  return db.query.packs.findFirst({ where: eq(packs.id, id) });
}

function getMods(packId: string) {
  return db.query.mods.findMany({
    where: eq(mods.packId, packId),
    orderBy: (mod, { asc }) => [asc(mod.id)],
  });
}

beforeAll(async () => {
  // Shared parent rows (referenced by every pack fixture).
  await db.insert(users).values({
    id: "user-1",
    name: "uploader",
    email: "uploader@example.com",
    createdAt: STALE_UPDATED_AT,
    updatedAt: STALE_UPDATED_AT,
  });
  await db.insert(games).values({
    id: "game-1",
    name: "Super Smash Bros. Melee",
    slug: "ssbm",
    shortName: "Melee",
    createdAt: STALE_UPDATED_AT,
    updatedAt: STALE_UPDATED_AT,
  });
  await db.insert(targets).values({
    id: "target-1",
    gameId: "game-1",
    name: "Fox",
    slug: "fox",
    category: "character",
  });
  await db.insert(targetSlots).values({ id: "slot-1", targetId: "target-1", name: "Neutral" });
});

beforeEach(async () => {
  // packs cascades to mods and pack_images; parent rows persist.
  await db.delete(packs);
});

describe("sweepStaleProcessingPacks", () => {
  it("a timed-out job that completes later still brings its pack to pending", async () => {
    await insertPack({
      id: "pack-late",
      updatedAt: STALE_UPDATED_AT,
      imageProcessingStatus: "skipped",
      mods: [{ id: "mod-late", processingStatus: "processing" }],
    });
    await sweepStaleProcessingPacks(db, SWEEP_NOW);
    await expect(getPack("pack-late")).resolves.toMatchObject({ status: "corrupted" });

    // What processDatFile records when the late job validates the DAT.
    await db.update(mods).set({ processingStatus: "succeeded" }).where(eq(mods.id, "mod-late"));
    await refreshPackProcessingStatus(db, "pack-late");

    await expect(getPack("pack-late")).resolves.toMatchObject({ status: "pending" });
  });

  it("fails a lost image job so the images/retry endpoint accepts it, preserving successful DATs", async () => {
    await insertPack({
      id: "pack-lost-processing",
      updatedAt: STALE_UPDATED_AT,
      imageProcessingStatus: "processing",
      mods: [{ id: "mod-dat-1", processingStatus: "succeeded" }],
    });
    await insertPack({
      id: "pack-lost-pending",
      updatedAt: STALE_UPDATED_AT,
      imageProcessingStatus: "pending",
      mods: [{ id: "mod-dat-2", processingStatus: "succeeded" }],
    });
    // The retry endpoint also requires pack.images.length > 0.
    await db
      .insert(packImages)
      .values({ id: "img-1", packId: "pack-lost-processing", imageKey: "raw/one.png" });

    await expect(sweepStaleProcessingPacks(db, SWEEP_NOW)).resolves.toBe(2);

    // Both lost-job states must satisfy the exact retry guard in
    // packages/api/src/routes/packs.ts: imageProcessingStatus === "failed".
    for (const packId of ["pack-lost-processing", "pack-lost-pending"]) {
      await expect(getPack(packId)).resolves.toMatchObject({
        status: "corrupted",
        imageProcessingStatus: "failed",
        imageProcessingError: STALE_TIMEOUT_MESSAGE,
      });
      await expect(getMods(packId)).resolves.toMatchObject([
        { processingStatus: "succeeded", processingError: null },
      ]);
    }
    await expect(
      db.query.packImages.findFirst({ where: eq(packImages.id, "img-1") })
    ).resolves.toMatchObject({ imageKey: "raw/one.png" });
  });

  it("preserves finished image work on stale packs", async () => {
    await insertPack({
      id: "pack-images-succeeded",
      updatedAt: STALE_UPDATED_AT,
      imageProcessingStatus: "succeeded",
      mods: [{ id: "mod-dat-3", processingStatus: "succeeded" }],
    });
    await insertPack({
      id: "pack-images-skipped",
      updatedAt: STALE_UPDATED_AT,
      imageProcessingStatus: "skipped",
    });
    await insertPack({
      id: "pack-images-failed",
      updatedAt: STALE_UPDATED_AT,
      imageProcessingStatus: "failed",
      imageProcessingError: "Upload to bucket failed",
    });

    await sweepStaleProcessingPacks(db, SWEEP_NOW);

    // The pack is still timed out as corrupted, but finished image work keeps
    // its status and error fields exactly as they were.
    await expect(getPack("pack-images-succeeded")).resolves.toMatchObject({
      status: "corrupted",
      imageProcessingStatus: "succeeded",
      imageProcessingError: null,
    });
    await expect(getPack("pack-images-skipped")).resolves.toMatchObject({
      status: "corrupted",
      imageProcessingStatus: "skipped",
      imageProcessingError: null,
    });
    await expect(getPack("pack-images-failed")).resolves.toMatchObject({
      status: "corrupted",
      imageProcessingStatus: "failed",
      imageProcessingError: "Upload to bucket failed",
    });
  });

  it("leaves non-stale packs completely untouched", async () => {
    await insertPack({
      id: "pack-fresh",
      updatedAt: FRESH_UPDATED_AT,
      imageProcessingStatus: "processing",
      mods: [{ id: "mod-dat-4", processingStatus: "queued" }],
    });

    await expect(sweepStaleProcessingPacks(db, SWEEP_NOW)).resolves.toBe(0);

    await expect(getPack("pack-fresh")).resolves.toMatchObject({
      status: "processing",
      imageProcessingStatus: "processing",
      imageProcessingError: null,
    });
    await expect(getMods("pack-fresh")).resolves.toMatchObject([{ processingStatus: "queued" }]);
  });

  it("fails only stuck mods while keeping succeeded mods", async () => {
    await insertPack({
      id: "pack-mixed-mods",
      updatedAt: STALE_UPDATED_AT,
      imageProcessingStatus: "skipped",
      mods: [
        { id: "mod-queued", processingStatus: "queued" },
        { id: "mod-done", processingStatus: "succeeded" },
      ],
    });

    await sweepStaleProcessingPacks(db, SWEEP_NOW);

    const sweptMods = await getMods("pack-mixed-mods");
    const queuedMod = sweptMods.find((mod) => mod.id === "mod-queued");
    const doneMod = sweptMods.find((mod) => mod.id === "mod-done");
    expect(queuedMod).toMatchObject({
      processingStatus: "failed",
      processingError: STALE_TIMEOUT_MESSAGE,
      processedAt: expect.any(Date),
    });
    expect(doneMod).toMatchObject({
      processingStatus: "succeeded",
      processingError: null,
      processedAt: null,
    });
  });
});

it("a corrupted pack left unrepaired for 30 days is deleted with its files", async () => {
  const abandonedAt = new Date(SWEEP_NOW.getTime() - ABANDONED_CORRUPTED_AGE_MS - 60_000);
  for (const [id, updatedAt] of [
    ["pack-abandoned", abandonedAt],
    ["pack-recent", FRESH_UPDATED_AT],
  ] as const) {
    await insertPack({ id, updatedAt, imageProcessingStatus: "failed" });
    await db.update(packs).set({ status: "corrupted", updatedAt }).where(eq(packs.id, id));
    await env.BUCKET.put(`packs/${id}/images/0.png`, "bytes");
  }

  await expect(sweepAbandonedCorruptedPacks(db, env.BUCKET, SWEEP_NOW)).resolves.toBe(1);

  expect((await getPack("pack-abandoned"))?.deletedAt).toEqual(SWEEP_NOW);
  expect(await env.BUCKET.head("packs/pack-abandoned/images/0.png")).toBeNull();
  expect((await getPack("pack-recent"))?.deletedAt).toBeNull();
  expect(await env.BUCKET.head("packs/pack-recent/images/0.png")).not.toBeNull();
});
