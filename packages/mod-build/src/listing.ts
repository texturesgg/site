// A release's store listing, read from its source once when it is recorded
// (so review covers it) and kept in D1 and R2 for the registry's
// /api/registry/mods routes: the README, this version's CHANGELOG.md section,
// the manifest's tags, homepage and Slippi codes, and its icon and
// screenshots.

import { codeModReleaseImages, codeModReleases, type Database } from "@vgskins/db";
import type { SlippiCodeDecl } from "@vgskins/shared";
import { eq } from "drizzle-orm";
import type { SourceManifest } from "./manifest";
import type { Commit } from "./source";

// Markdown past these is cut at a line: a listing, not a manual.
const MAX_README = 128 * 1024;
const MAX_CHANGELOG = 16 * 1024;
// A README or CHANGELOG.md longer than this isn't read at all.
const MAX_TEXT_FILE = 1024 * 1024;
const MAX_ICON_BYTES = 512 * 1024;
const MAX_SCREENSHOT_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_SIDE = 4096;
const README = /^readme(\.md|\.markdown)?$/i;
const CHANGELOG = /^changelog(\.md|\.markdown)?$/i;

export type ListingImage = {
  kind: "icon" | "screenshot";
  position: number;
  sha256: string;
  width: number;
  height: number;
  bytes: Uint8Array<ArrayBuffer>;
};

export type Listing = {
  readme: string | null;
  changelog: string | null;
  tags: string[];
  homepage: string | null;
  slippi: SlippiCodeDecl[];
  images: ListingImage[];
};

/** Where a listing's image is kept in the registry's bucket. */
export function imageKey(sha256: string): string {
  return `code-mods/images/${sha256}.png`;
}

/**
 * The listing of the release `manifest` makes at `commit`, or why it can't
 * have one: an icon or screenshot that is missing or isn't a PNG of a
 * sensible size.
 */
export async function readListing(
  repo: ArtifactsRepo,
  commit: Commit,
  manifest: SourceManifest
): Promise<{ listing: Listing } | { error: string }> {
  const root = (await repo.readTree(commit.tree)) ?? [];
  const text = async (pattern: RegExp, limit: number): Promise<string | null> => {
    const entry = root.find((file) => file.type === "blob" && pattern.test(file.name));
    if (!entry) return null;
    const blob = await repo.readBlob(entry.hash);
    if (!blob || blob.size > limit) return null;
    return blob.text();
  };

  const readme = await text(README, MAX_TEXT_FILE).catch(() => null);
  const changelogFile = await text(CHANGELOG, MAX_TEXT_FILE).catch(() => null);

  const images: ListingImage[] = [];
  const wanted = [
    ...(manifest.icon ? [{ kind: "icon" as const, position: 0, path: manifest.icon }] : []),
    ...manifest.screenshots.map((path, position) => ({
      kind: "screenshot" as const,
      position,
      path,
    })),
  ];
  for (const { kind, position, path } of wanted) {
    const blob = await repo.readFile({ ref: commit.id, path: `assets/${path}` });
    if (!blob) return { error: `manifest.json's ${kind} assets/${path} isn't in the source` };
    const limit = kind === "icon" ? MAX_ICON_BYTES : MAX_SCREENSHOT_BYTES;
    if (blob.size > limit) {
      return { error: `assets/${path} is over ${limit / 1024} KiB` };
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const size = pngSize(bytes);
    if (!size) return { error: `assets/${path} isn't a PNG` };
    if (size.width > MAX_IMAGE_SIDE || size.height > MAX_IMAGE_SIDE) {
      return { error: `assets/${path} is over ${MAX_IMAGE_SIDE} pixels on a side` };
    }
    images.push({ kind, position, sha256: await sha256Hex(bytes), ...size, bytes });
  }

  return {
    listing: {
      readme: readme === null ? null : cut(readme, MAX_README),
      changelog: changelogFile === null ? null : changelogSection(changelogFile, manifest.version),
      tags: manifest.tags,
      homepage: manifest.homepage,
      slippi: manifest.slippi,
      images,
    },
  };
}

/** Keep `listing` for `releaseId`: its images in R2, the rest in D1. */
export async function storeListing(
  db: Database,
  bucket: R2Bucket,
  releaseId: string,
  listing: Listing
): Promise<void> {
  for (const image of listing.images) {
    await bucket.put(imageKey(image.sha256), image.bytes, {
      httpMetadata: { contentType: "image/png" },
    });
  }
  const rows = listing.images.map(({ bytes: _, ...image }) => ({ releaseId, ...image }));
  const update = db
    .update(codeModReleases)
    .set({
      readme: listing.readme,
      changelog: listing.changelog,
      tags: listing.tags,
      homepage: listing.homepage,
      slippi: listing.slippi,
      listedAt: new Date(),
    })
    .where(eq(codeModReleases.id, releaseId));
  const clear = db
    .delete(codeModReleaseImages)
    .where(eq(codeModReleaseImages.releaseId, releaseId));
  if (rows.length) {
    await db.batch([update, clear, db.insert(codeModReleaseImages).values(rows)]);
  } else {
    await db.batch([update, clear]);
  }
}

/**
 * The section of a changelog for `version`: the lines under the heading that
 * names it (`## 1.2.0`, `## [1.2.0] - 2026-11-07`, `### v1.2.0`) up to the
 * next heading as high, or null when no heading names it.
 */
export function changelogSection(text: string, version: string): string | null {
  const lines = text.split(/\r?\n/);
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const names = new RegExp(`(^|[^0-9A-Za-z.+-])v?${escaped}($|[^0-9A-Za-z.+-])`);
  let level = 0;
  const section: string[] = [];
  for (const line of lines) {
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (level === 0) {
      if (heading && names.test(heading[2])) level = heading[1].length;
      continue;
    }
    if (heading && heading[1].length <= level) break;
    section.push(line);
  }
  const body = section.join("\n").trim();
  return body ? cut(body, MAX_CHANGELOG) : null;
}

/** A PNG's width and height from its header, or null if it isn't a PNG. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || signature.some((byte, i) => bytes[i] !== byte)) return null;
  if (new TextDecoder().decode(bytes.subarray(12, 16)) !== "IHDR") return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  return width > 0 && height > 0 ? { width, height } : null;
}

/** `text` cut at the last line that fits in `limit` characters. */
function cut(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const end = text.lastIndexOf("\n", limit);
  return text.slice(0, end > 0 ? end : limit);
}

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
