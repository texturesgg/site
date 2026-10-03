import { createDb } from "@vgskins/db";
import { logger } from "@vgskins/logger";
import { getMeleeAnimationReferenceAsset } from "@vgskins/shared/melee-animation-reference";
import { Hono } from "hono";
import { getArtifact } from "../lib/artifacts";
import { optionalAuth } from "../lib/auth";
import { loadPack } from "../lib/queries";
import { validateFilePath } from "../lib/validation";
import type { HonoEnv } from "../types";

// A pack's objects are keyed under packs/<packId>/.
const PACK_KEY = /^packs\/([^/]+)\//;

const app = new Hono<HonoEnv>().get("/*", optionalAuth, async (c) => {
  const rawKey = c.req.path.replace(/^\/api\/files\//, "");
  if (!rawKey) return c.json({ error: "File key required" }, 404);

  const reference = getMeleeAnimationReferenceAsset(rawKey);
  if (rawKey.startsWith("reference/") && !reference) {
    return c.json({ error: "Reference asset not found" }, 404);
  }
  const key = reference?.key ?? validateFilePath(rawKey);
  if (!key) return c.json({ error: "Invalid file path" }, 400);

  // A pack's files are as visible as the pack. Only an approved pack's are
  // public; any other is served to its owner or a moderator, and kept by no cache.
  let cacheControl = "public, max-age=31536000, immutable";
  const packId = PACK_KEY.exec(key)?.[1];
  if (packId) {
    const db = createDb(c.env.DB);
    const pack = await loadPack(db, { id: packId }, { requester: c.get("user") });
    if (!pack) return c.json({ error: "File not found" }, 404);
    if (pack.status !== "approved") cacheControl = "private, no-store";
  }

  const file = await getArtifact(c.env, key);
  if (!file) {
    logger.warn({ key }, "Artifact not found");
    return c.json({ error: "File not found" }, 404);
  }

  const length = file instanceof Response ? file.headers.get("content-length") : null;
  const size = file.size ?? (length === null ? undefined : Number(length));
  if (reference && size !== undefined && size !== reference.byteLength) {
    await file.body?.cancel();
    throw new Error("Reference asset size does not match the catalog");
  }

  const contentTypes: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    dat: "application/octet-stream",
    json: "application/json",
    zip: "application/zip",
    "7z": "application/x-7z-compressed",
  };
  const ext = key.split(".").pop()?.toLowerCase() || "";
  const headers = new Headers({
    "content-type": contentTypes[ext] || "application/octet-stream",
    "cache-control": cacheControl,
    "x-content-type-options": "nosniff",
  });
  if (size !== undefined) headers.set("content-length", String(size));
  return new Response(file.body, { headers });
});

export default app;
