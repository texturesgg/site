// Reading a code mod's source out of its Artifacts repo for people: the files
// at a release's commit, one file's contents, and what changed between two
// commits. Everything here is keyed by commit or object hash, so it never
// changes and is kept in the Cache API once read.

import { unifiedPatch } from "./line-diff";

/** The Artifacts repo holding a code mod's source. */
export function modRepoName(codeModId: string): string {
  return `mod-${codeModId}`;
}

// A mod's repo is small; these bound one request's Artifacts reads.
const MAX_TREE_ENTRIES = 5000;
const MAX_TREES = 500;
const MAX_CHANGED_FILES = 500;
// File contents past this are cut (the browser) or not diffed (review).
export const MAX_FILE_BYTES = 1024 * 1024;
// The most file bytes one diff listing reads to count changed lines.
const MAX_DIFF_BYTES = 16 * 1024 * 1024;
// How much of a file is looked at for a NUL byte, as git does.
const BINARY_SNIFF_BYTES = 8000;

export type SourceEntryKind = "file" | "symlink" | "submodule";
export type SourceEntry = { path: string; kind: SourceEntryKind };

type Blob = { path: string; hash: string; mode: string; kind: SourceEntryKind };

function entryKind(type: ArtifactsTreeEntryType): SourceEntryKind | null {
  if (type === "blob" || type === "exec") return "file";
  if (type === "symlink") return "symlink";
  if (type === "gitlink") return "submodule";
  return null;
}

/**
 * The JSON `compute` makes, kept in the Cache API under `key` (which must name
 * only immutable things, such as commit hashes); null is not kept. Off a zone
 * (workers.dev) the cache keeps nothing and every read computes. Callers check
 * who may read before asking.
 */
async function cached<T>(key: string, compute: () => Promise<T>): Promise<T> {
  const request = new Request(`https://mod-source.cache/${key}`);
  const cache = await caches.open("mod-source");
  const hit = await cache.match(request);
  if (hit) return hit.json<T>();
  const value = await compute();
  if (value === null) return value;
  await cache.put(
    request,
    new Response(JSON.stringify(value), {
      headers: { "Content-Type": "application/json", "Cache-Control": "max-age=31536000" },
    })
  );
  return value;
}

/** Every file under tree `hash`, sorted by path, and whether the walk stopped early. */
async function walkTree(
  repo: ArtifactsRepo,
  hash: string
): Promise<{ blobs: Blob[]; truncated: boolean }> {
  const blobs: Blob[] = [];
  let trees = 0;
  let truncated = false;
  const walk = async (tree: string, prefix: string) => {
    if (++trees > MAX_TREES) {
      truncated = true;
      return;
    }
    const entries = (await repo.readTree(tree)) ?? [];
    for (const entry of entries) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.type === "tree") {
        await walk(entry.hash, path);
      } else {
        const kind = entryKind(entry.type);
        if (!kind) continue;
        if (blobs.length >= MAX_TREE_ENTRIES) {
          truncated = true;
          return;
        }
        blobs.push({ path, hash: entry.hash, mode: entry.mode, kind });
      }
      if (truncated) return;
    }
  };
  await walk(hash, "");
  blobs.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { blobs, truncated };
}

/** The commit's root tree, or null when the repo doesn't have the commit. */
async function rootTree(repo: ArtifactsRepo, commit: string): Promise<string | null> {
  return (await repo.readCommit(commit))?.treeHash ?? null;
}

/** Every file at `commit`, or null when the repo doesn't have it. */
export function listFiles(
  repo: ArtifactsRepo,
  commit: string
): Promise<{ entries: SourceEntry[]; truncated: boolean } | null> {
  return cached(`${commit}/tree`, async () => {
    const tree = await rootTree(repo, commit);
    if (!tree) return null;
    const { blobs, truncated } = await walkTree(repo, tree);
    return { entries: blobs.map(({ path, kind }) => ({ path, kind })), truncated };
  });
}

/** Whether `bytes` look like a binary file: a NUL early on, or not UTF-8. */
function isBinary(bytes: Uint8Array): boolean {
  if (bytes.subarray(0, BINARY_SNIFF_BYTES).includes(0)) return true;
  try {
    // A cut at the end may split a character; stream mode leaves it pending.
    new TextDecoder("utf-8", { fatal: true }).decode(bytes, { stream: true });
    return false;
  } catch {
    return true;
  }
}

function decodeText(bytes: Uint8Array): string {
  return new TextDecoder("utf-8").decode(bytes, { stream: true });
}

export type SourceFile = {
  path: string;
  kind: SourceEntryKind;
  size: number;
  binary: boolean;
  // Cut at MAX_FILE_BYTES; null for a binary file or a submodule.
  content: string | null;
  truncated: boolean;
};

/** The file at `path` in `commit`, or null when there is no such file. */
export function readSourceFile(
  repo: ArtifactsRepo,
  commit: string,
  path: string
): Promise<SourceFile | null> {
  return cached(`${commit}/file/${encodeURIComponent(path)}`, async () => {
    const tree = await rootTree(repo, commit);
    if (!tree) return null;
    const blob = await findBlob(repo, tree, path);
    if (!blob) return null;
    if (blob.kind === "submodule") {
      return { path, kind: blob.kind, size: 0, binary: true, content: null, truncated: false };
    }
    const data = await repo.readBlob(blob.hash);
    if (!data) return null;
    const bytes = new Uint8Array(await data.slice(0, MAX_FILE_BYTES).arrayBuffer());
    const binary = isBinary(bytes);
    return {
      path,
      kind: blob.kind,
      size: data.size,
      binary,
      content: binary ? null : decodeText(bytes),
      truncated: !binary && data.size > MAX_FILE_BYTES,
    };
  });
}

/** The file at `path` under tree `root`, reading one tree per folder. */
async function findBlob(repo: ArtifactsRepo, root: string, path: string): Promise<Blob | null> {
  const parts = path.split("/");
  let tree = root;
  for (const [i, name] of parts.entries()) {
    const entry = (await repo.readTree(tree))?.find((item) => item.name === name);
    if (!entry) return null;
    if (i < parts.length - 1) {
      if (entry.type !== "tree") return null;
      tree = entry.hash;
      continue;
    }
    const kind = entryKind(entry.type);
    return kind ? { path, hash: entry.hash, mode: entry.mode, kind } : null;
  }
  return null;
}

export type ChangeStatus = "added" | "removed" | "modified" | "renamed";
export type ChangedFile = {
  path: string;
  // The path before a rename; null otherwise.
  previousPath: string | null;
  status: ChangeStatus;
  binary: boolean;
  // Null for a binary file, or one too large to count.
  additions: number | null;
  deletions: number | null;
};

type Change = { path: string; before: Blob | null; after: Blob | null };

/**
 * The files that differ between trees `base` and `head`. A folder whose hash
 * is the same on both sides is skipped without reading it.
 */
async function changedBlobs(
  repo: ArtifactsRepo,
  base: string,
  head: string
): Promise<{ changes: Change[]; truncated: boolean }> {
  const changes: Change[] = [];
  let trees = 0;
  let truncated = false;
  const files = async (tree: string | null, prefix: string) =>
    tree
      ? (await walkTree(repo, tree)).blobs.map((blob) => ({
          ...blob,
          path: `${prefix}${blob.path}`,
        }))
      : [];
  const compare = async (before: string | null, after: string | null, prefix: string) => {
    if (truncated) return;
    if (++trees > MAX_TREES) {
      truncated = true;
      return;
    }
    const [left, right] = await Promise.all([
      before ? repo.readTree(before) : null,
      after ? repo.readTree(after) : null,
    ]);
    const names = new Set([...(left ?? []), ...(right ?? [])].map((entry) => entry.name));
    for (const name of names) {
      const a = left?.find((entry) => entry.name === name);
      const b = right?.find((entry) => entry.name === name);
      if (a && b && a.hash === b.hash && a.mode === b.mode) continue;
      const path = `${prefix}${name}`;
      const aTree = a?.type === "tree" ? a.hash : null;
      const bTree = b?.type === "tree" ? b.hash : null;
      if (aTree && bTree) {
        await compare(aTree, bTree, `${path}/`);
      } else if (aTree || bTree) {
        // A folder on one side only, perhaps with a file of its name on the other.
        for (const blob of await files(aTree, `${path}/`)) {
          changes.push({ path: blob.path, before: blob, after: null });
        }
        for (const blob of await files(bTree, `${path}/`)) {
          changes.push({ path: blob.path, before: null, after: blob });
        }
      }
      const aBlob = a && !aTree ? entryKind(a.type) : null;
      const bBlob = b && !bTree ? entryKind(b.type) : null;
      if (aBlob || bBlob) {
        changes.push({
          path,
          before: a && aBlob ? { path, hash: a.hash, mode: a.mode, kind: aBlob } : null,
          after: b && bBlob ? { path, hash: b.hash, mode: b.mode, kind: bBlob } : null,
        });
      }
      if (changes.length > MAX_CHANGED_FILES) {
        truncated = true;
        return;
      }
    }
  };
  await compare(base, head, "");
  changes.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { changes: changes.slice(0, MAX_CHANGED_FILES), truncated };
}

type Paired = {
  path: string;
  previousPath: string | null;
  before: Blob | null;
  after: Blob | null;
};

/** Changes with a removed file paired to an added one of the same contents, as renames. */
function pairRenames(changes: Change[]): Paired[] {
  const removed = new Map<string, Change[]>();
  for (const change of changes) {
    if (change.before && !change.after) {
      removed.set(change.before.hash, [...(removed.get(change.before.hash) ?? []), change]);
    }
  }
  const renamedFrom = new Map<Change, Change>();
  const used = new Set<Change>();
  for (const change of changes) {
    if (change.before || !change.after) continue;
    const from = removed.get(change.after.hash)?.find((item) => !used.has(item));
    if (from) {
      used.add(from);
      renamedFrom.set(change, from);
    }
  }
  return changes
    .filter((change) => !used.has(change))
    .map((change) => {
      const from = renamedFrom.get(change);
      return from
        ? { path: change.path, previousPath: from.path, before: from.before, after: change.after }
        : { path: change.path, previousPath: null, before: change.before, after: change.after };
    });
}

function statusOf(change: Paired): ChangeStatus {
  if (change.previousPath !== null) return "renamed";
  if (!change.before) return "added";
  if (!change.after) return "removed";
  return "modified";
}

/** A blob's text, or null for binary (or unreadable) contents. */
async function readText(
  repo: ArtifactsRepo,
  blob: Blob | null
): Promise<{ text: string | null; size: number; binary: boolean }> {
  if (!blob) return { text: "", size: 0, binary: false };
  if (blob.kind === "submodule") return { text: null, size: 0, binary: true };
  const data = await repo.readBlob(blob.hash);
  if (!data) return { text: null, size: 0, binary: true };
  if (data.size > MAX_FILE_BYTES) return { text: null, size: data.size, binary: false };
  const bytes = new Uint8Array(await data.arrayBuffer());
  return isBinary(bytes)
    ? { text: null, size: data.size, binary: true }
    : { text: decodeText(bytes), size: data.size, binary: false };
}

export type SourceDiff = { files: ChangedFile[]; truncated: boolean };

/** What changed from commit `base` to commit `head`, or null when the repo lacks either. */
export function diffCommits(
  repo: ArtifactsRepo,
  base: string,
  head: string
): Promise<SourceDiff | null> {
  return cached(`${base}..${head}/diff`, async () => {
    const [baseTree, headTree] = await Promise.all([rootTree(repo, base), rootTree(repo, head)]);
    if (!baseTree || !headTree) return null;
    const { changes, truncated } = await changedBlobs(repo, baseTree, headTree);
    let budget = MAX_DIFF_BYTES;
    const files: ChangedFile[] = [];
    for (const change of pairRenames(changes)) {
      const status = statusOf(change);
      const counted = { path: change.path, previousPath: change.previousPath, status };
      if (status === "renamed" && change.before?.hash === change.after?.hash) {
        files.push({ ...counted, binary: false, additions: 0, deletions: 0 });
        continue;
      }
      if (budget <= 0) {
        files.push({ ...counted, binary: false, additions: null, deletions: null });
        continue;
      }
      const [before, after] = await Promise.all([
        readText(repo, change.before),
        readText(repo, change.after),
      ]);
      budget -= before.size + after.size;
      const binary = before.binary || after.binary;
      if (before.text === null || after.text === null) {
        files.push({ ...counted, binary, additions: null, deletions: null });
        continue;
      }
      const { additions, deletions } = unifiedPatch(before.text, after.text, {
        before: change.previousPath ?? change.path,
        after: change.path,
      });
      files.push({ ...counted, binary: false, additions, deletions });
    }
    return { files, truncated };
  });
}

export type FilePatch = ChangedFile & {
  // The unified diff; null for a binary file or one over MAX_FILE_BYTES.
  patch: string | null;
};

/**
 * One changed file's patch from commit `base` to `head`: `path` is its path in
 * `head`, or in `base` for a removed file. Null when it didn't change.
 */
export async function diffFile(
  repo: ArtifactsRepo,
  base: string,
  head: string,
  path: string
): Promise<FilePatch | null> {
  const diff = await diffCommits(repo, base, head);
  const file = diff?.files.find((item) => item.path === path);
  if (!file) return null;
  return cached(`${base}..${head}/patch/${encodeURIComponent(path)}`, async () => {
    const [baseTree, headTree] = await Promise.all([rootTree(repo, base), rootTree(repo, head)]);
    if (!baseTree || !headTree) return null;
    const beforePath = file.status === "added" ? null : (file.previousPath ?? file.path);
    const afterPath = file.status === "removed" ? null : file.path;
    const [beforeBlob, afterBlob] = await Promise.all([
      beforePath ? findBlob(repo, baseTree, beforePath) : null,
      afterPath ? findBlob(repo, headTree, afterPath) : null,
    ]);
    const [before, after] = await Promise.all([
      readText(repo, beforeBlob),
      readText(repo, afterBlob),
    ]);
    if (before.text === null || after.text === null) {
      return { ...file, binary: before.binary || after.binary, patch: null };
    }
    const result = unifiedPatch(beforePath ? before.text : null, afterPath ? after.text : null, {
      before: beforePath ?? file.path,
      after: afterPath ?? file.path,
    });
    return { ...file, ...result, binary: false };
  });
}
