// Reading a mod's source out of its Artifacts repo: the commit a tag points
// at, the manifest, and the files a build needs.

import { NonRetryableError } from "cloudflare:workflows";
import { parseManifest, type SourceManifest } from "./manifest";

// A mod's source is manifest.json, C under src/, headers it shares under
// include/, and the files it ships under files/ and assets/; nothing else is
// copied. Game files make a mod megabytes. The source, and the package that
// comes back, pass through this Worker's memory, so the registry takes less
// than tgg's own 256 MiB.
const MAX_FILES = 2048;
const MAX_SOURCE_BYTES = 64 * 1024 * 1024;
const SOURCE_FOLDERS = new Set(["src", "include", "files", "assets"]);

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

/** The manifest at `commit`; see parseManifest. */
export async function readManifest(repo: ArtifactsRepo, commit: string): Promise<SourceManifest> {
  const file = await repo.readFile({ ref: commit, path: "manifest.json" });
  if (!file) throw new NonRetryableError("the source has no manifest.json");
  const parsed = parseManifest(await file.text());
  if ("error" in parsed) throw new NonRetryableError(parsed.error);
  return parsed.manifest;
}

/**
 * Every file a build needs: manifest.json, and everything under src/,
 * include/, files/ and assets/ but names starting with "." (tgg leaves those
 * out).
 */
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
      const top = path.split("/")[0];
      const wanted =
        path === "manifest.json" || (SOURCE_FOLDERS.has(top) && !entry.name.startsWith("."));
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

/**
 * Whether the source has C under src/, which `tgg mod build` compiles into a
 * library. A mod without one is files and assets alone, so its package is the
 * same for every layout.
 */
export async function hasLibrary(repo: ArtifactsRepo, tree: string): Promise<boolean> {
  const look = async (hash: string): Promise<boolean> => {
    const entries = await repo.readTree(hash);
    if (!entries) throw new Error(`tree ${hash} not found`);
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      if (entry.type === "blob" && entry.name.endsWith(".c")) return true;
      if (entry.type === "tree" && (await look(entry.hash))) return true;
    }
    return false;
  };
  const src = (await repo.readTree(tree))?.find(
    (entry) => entry.name === "src" && entry.type === "tree"
  );
  return src ? look(src.hash) : false;
}
