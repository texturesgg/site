import { createMessageBatch, env } from "cloudflare:test";
import { createDb, games, mods, packs, targetSlots, targets, users } from "@vgskins/db";
import { expect, it, vi } from "vitest";
import worker from "./index";

// A parser trap cannot be provoked from a well-formed input, so the validator
// answers here: the first file traps, the second validates.
vi.mock("./dat-validator", () => ({
  validateDat: vi
    .fn()
    .mockRejectedValueOnce(new WebAssembly.RuntimeError("unreachable"))
    .mockResolvedValueOnce(null),
}));

const db = createDb(env.DB);

it("a parser trap fails only its own file, with a reason the uploader can act on", async () => {
  const now = new Date();
  await db
    .insert(users)
    .values({ id: "owner", name: "owner", email: "o@example.com", createdAt: now, updatedAt: now });
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
  await db.insert(targetSlots).values([
    { id: "neutral", targetId: "fox", name: "Neutral" },
    { id: "red", targetId: "fox", name: "Red", sortOrder: 1 },
  ]);
  await db.insert(packs).values({
    id: "pack",
    userId: "owner",
    gameId: "game",
    targetId: "fox",
    title: "Pack",
    slug: "pack",
    status: "processing",
    expectedModCount: 2,
    createdAt: now,
    updatedAt: now,
  });
  for (const slotId of ["neutral", "red"]) {
    const fileKey = `packs/pack/mods/${slotId}/PlFxNr.dat`;
    await db.insert(mods).values({
      id: slotId,
      packId: "pack",
      slotId,
      fileKey,
      fileName: "PlFxNr.dat",
      createdAt: now,
      processingStatus: "queued",
    });
    await env.BUCKET.put(fileKey, "bytes");
  }

  const batch = createMessageBatch(
    "vgskins-processing",
    ["neutral", "red"].map((modId) => ({
      id: modId,
      timestamp: now,
      attempts: 1,
      body: { type: "process_dat", modId, packId: "pack" },
    }))
  );
  await worker.queue(batch, env);

  const results = await db.query.mods.findMany({
    columns: { id: true, processingStatus: true, processingError: true },
    orderBy: (mod, { asc }) => [asc(mod.id)],
  });
  expect(results).toEqual([
    {
      id: "neutral",
      processingStatus: "failed",
      processingError: "The parser could not process this file",
    },
    { id: "red", processingStatus: "succeeded", processingError: null },
  ]);
});
