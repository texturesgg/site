import { env } from "cloudflare:workers";
import {
  codeModReleaseImages,
  codeModReleases,
  codeMods,
  createDb,
  games,
  users,
} from "@vgskins/db";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { changelogSection, imageKey, pngSize, readListing, storeListing } from "./listing";
import { parseManifest, type SourceManifest } from "./manifest";

const db = createDb(env.DB);
const NOW = new Date();

/** The first bytes of a PNG `width` by `height`: enough for its header. */
function png(width: number, height: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
  bytes.set(new TextEncoder().encode("IHDR"), 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

/** A repo of `files` (path to contents) at one commit, as readListing reads it. */
function repo(files: Record<string, string | Uint8Array<ArrayBuffer>>): ArtifactsRepo {
  const blob = (path: string) => (path in files ? new Blob([files[path]]) : null);
  const root = Object.keys(files)
    .filter((path) => !path.includes("/"))
    .map((name) => ({ name, mode: "100644", hash: name, type: "blob" as const }));
  return {
    readTree: async () => root,
    readBlob: async (hash: string) => blob(hash),
    readFile: async ({ path }: { path: string }) => blob(path),
  } as unknown as ArtifactsRepo;
}

function manifest(fields: Record<string, unknown>): SourceManifest {
  const parsed = parseManifest(
    JSON.stringify({ api: "tgg-melee/0", id: "me.mod", version: "1.2.0", ...fields })
  );
  if ("error" in parsed) throw new Error(parsed.error);
  return parsed.manifest;
}

const COMMIT = { id: "c".repeat(40), tree: "t".repeat(40) };

describe("changelogSection", () => {
  const changelog = [
    "# Changelog",
    "",
    "## [1.2.0] - 2026-11-07",
    "",
    "- Faster.",
    "### Fixed",
    "- A crash.",
    "",
    "## [1.1.0]",
    "- Older.",
  ].join("\n");

  it("takes the lines under the heading naming the version", () => {
    expect(changelogSection(changelog, "1.2.0")).toBe("- Faster.\n### Fixed\n- A crash.");
    expect(changelogSection(changelog, "1.1.0")).toBe("- Older.");
    expect(changelogSection("## v2.0.0\nNew.", "2.0.0")).toBe("New.");
  });

  it("finds nothing for a version no heading names", () => {
    expect(changelogSection(changelog, "1.2")).toBeNull();
    expect(changelogSection(changelog, "1.2.0-beta")).toBeNull();
    expect(changelogSection("## 11.2.0\nNo.", "1.2.0")).toBeNull();
  });
});

describe("pngSize", () => {
  it("reads a PNG's size from its header", () => {
    expect(pngSize(png(256, 128))).toEqual({ width: 256, height: 128 });
    expect(pngSize(new TextEncoder().encode("GIF89a, not a PNG at all"))).toBeNull();
  });
});

describe("readListing", () => {
  it("reads the README, the version's changelog and the images", async () => {
    const read = await readListing(
      repo({
        "README.md": "# Mod\n\nIt does things.",
        "CHANGELOG.md": "## 1.2.0\n- New things.\n## 1.1.0\n- Old things.",
        "assets/icon.png": png(64, 64),
        "assets/shot.png": png(640, 480),
      }),
      COMMIT,
      manifest({ icon: "icon.png", screenshots: ["shot.png"], tags: ["visual"] })
    );
    if ("error" in read) throw new Error(read.error);
    expect(read.listing).toMatchObject({
      readme: "# Mod\n\nIt does things.",
      changelog: "- New things.",
      tags: ["visual"],
      homepage: null,
      images: [
        { kind: "icon", position: 0, width: 64, height: 64 },
        { kind: "screenshot", position: 0, width: 640, height: 480 },
      ],
    });
  });

  it("has no README or changelog when the source has none", async () => {
    const read = await readListing(repo({ "manifest.json": "{}" }), COMMIT, manifest({}));
    expect(read).toEqual({
      listing: { readme: null, changelog: null, tags: [], homepage: null, slippi: [], images: [] },
    });
  });

  it("refuses an icon that is missing or isn't a PNG", async () => {
    const missing = await readListing(repo({}), COMMIT, manifest({ icon: "icon.png" }));
    expect(missing).toEqual({ error: expect.stringContaining("isn't in the source") });
    const jpeg = await readListing(
      repo({ "assets/icon.png": new TextEncoder().encode("\xff\xd8\xff not a png really") }),
      COMMIT,
      manifest({ icon: "icon.png" })
    );
    expect(jpeg).toEqual({ error: "assets/icon.png isn't a PNG" });
  });
});

describe("storeListing", () => {
  beforeAll(async () => {
    await db.insert(users).values({
      id: "owner",
      name: "owner",
      email: "owner@example.com",
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.insert(games).values({
      id: "melee",
      name: "Super Smash Bros. Melee",
      slug: "melee",
      shortName: "Melee",
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.insert(codeMods).values({
      id: "me.mod",
      userId: "owner",
      gameId: "melee",
      slug: "me.mod",
      name: "Mod",
      sourceKind: "push",
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.insert(codeModReleases).values({
      id: "r1",
      codeModId: "me.mod",
      version: "1.2.0",
      tag: "v1.2.0",
      commitSha: COMMIT.id,
      createdAt: NOW,
      updatedAt: NOW,
    });
  });

  it("keeps images by hash in R2 and the rest in D1, replacing an earlier listing", async () => {
    const read = await readListing(
      repo({ "README.md": "Hi.", "assets/icon.png": png(32, 32) }),
      COMMIT,
      manifest({
        icon: "icon.png",
        homepage: "https://example.com",
        slippi: [{ code: "0x8016E510", name: "Neutral Spawns" }],
      })
    );
    if ("error" in read) throw new Error(read.error);
    await storeListing(db, env.PACKAGES, "r1", read.listing);
    await storeListing(db, env.PACKAGES, "r1", read.listing);

    const [release] = await db.select().from(codeModReleases).where(eq(codeModReleases.id, "r1"));
    expect(release).toMatchObject({
      readme: "Hi.",
      homepage: "https://example.com",
      tags: [],
      slippi: [{ code: "0x8016E510", name: "Neutral Spawns", versions: "*" }],
    });
    expect(release.listedAt).not.toBeNull();
    const images = await db.select().from(codeModReleaseImages);
    expect(images).toEqual([
      {
        releaseId: "r1",
        kind: "icon",
        position: 0,
        sha256: images[0].sha256,
        width: 32,
        height: 32,
      },
    ]);
    const object = await env.PACKAGES.get(imageKey(images[0].sha256));
    expect(object?.httpMetadata?.contentType).toBe("image/png");
  });
});
