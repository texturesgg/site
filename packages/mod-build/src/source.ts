// Reading a mod's source out of its Artifacts repo: the commit a tag points
// at, the manifest, and the files a build needs.

import { NonRetryableError } from "cloudflare:workflows";

// A mod's source is manifest.json and C under src/; nothing else is copied.
const MAX_FILES = 256;
const MAX_SOURCE_BYTES = 4 * 1024 * 1024;

export type Commit = { id: string; tree: string };

/**
 * The commit a tag points at, and that commit's root tree. A push names the
 * commit for a lightweight tag. For an annotated tag it names the tag object,
 * which readCommit refuses, so its history is read by the tag's bare name.
 */
export async function resolveTag(
  repo: ArtifactsRepo,
  tag: string,
  pushed: string
): Promise<Commit> {
  const commit =
    (await repo.readCommit(pushed).catch(() => null)) ??
    (await repo.log({ ref: tag, limit: 1 }))[0];
  if (!commit) throw new NonRetryableError(`tag ${tag} not found`);
  return { id: commit.hash, tree: commit.treeHash };
}

/** The manifest fields a release records, read at `commit`. */
export type SourceManifest = {
  id: string;
  version: string;
  netplay: "cosmetic" | "gameplay";
  license: string | null;
};

export async function readManifest(repo: ArtifactsRepo, commit: string): Promise<SourceManifest> {
  const file = await repo.readFile({ ref: commit, path: "manifest.json" });
  if (!file) throw new NonRetryableError("the source has no manifest.json");
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(await file.text());
  } catch {
    throw new NonRetryableError("manifest.json is not JSON");
  }
  const { id, version, netplay, license } = json;
  if (typeof id !== "string" || typeof version !== "string") {
    throw new NonRetryableError("manifest.json needs an id and a version");
  }
  return {
    id,
    version,
    // The runtime counts a missing value as gameplay.
    netplay: netplay === "cosmetic" ? "cosmetic" : "gameplay",
    license: typeof license === "string" ? license : null,
  };
}

/** Every file a build needs: manifest.json and everything under src/. */
export async function readSource(
  repo: ArtifactsRepo,
  tree: string
): Promise<{ path: string; bytes: Uint8Array }[]> {
  const files: { path: string; bytes: Uint8Array }[] = [];
  let total = 0;
  const walk = async (hash: string, prefix: string) => {
    const entries = await repo.readTree(hash);
    if (!entries) throw new Error(`tree ${hash} not found`);
    for (const entry of entries) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      const wanted = path === "manifest.json" || path === "src" || path.startsWith("src/");
      if (!wanted) continue;
      if (entry.type === "tree") {
        await walk(entry.hash, path);
      } else if (entry.type === "blob") {
        const blob = await repo.readBlob(entry.hash);
        if (!blob) throw new Error(`blob ${entry.hash} (${path}) not found`);
        const bytes = new Uint8Array(await blob.arrayBuffer());
        total += bytes.length;
        if (files.push({ path, bytes }) > MAX_FILES || total > MAX_SOURCE_BYTES) {
          throw new NonRetryableError(
            `the source is over ${MAX_FILES} files or ${MAX_SOURCE_BYTES} bytes`
          );
        }
      }
    }
  };
  await walk(tree, "");
  return files;
}
