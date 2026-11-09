// An Artifacts binding over in-memory commits, for routes that read a code
// mod's source. Only the reads (readCommit, readTree, readBlob) answer.

type Files = Record<string, string | Uint8Array<ArrayBuffer>>;

async function sha1(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * `MOD_SOURCES` with repo `mod-<codeModId>` holding `commits`, each a commit
 * hash and its files by path. Trees and blobs are hashed by content, so equal
 * folders in two commits share a hash, as in git.
 */
export async function fakeModSources(codeModId: string, commits: Record<string, Files>) {
  const blobs = new Map<string, Uint8Array<ArrayBuffer>>();
  const trees = new Map<string, ArtifactsTreeEntry[]>();
  const roots = new Map<string, string>();

  const store = async (files: Files): Promise<string> => {
    const children = new Map<string, Files>();
    const entries: ArtifactsTreeEntry[] = [];
    for (const [path, content] of Object.entries(files)) {
      const [name, ...rest] = path.split("/");
      if (rest.length) {
        children.set(name, { ...children.get(name), [rest.join("/")]: content });
        continue;
      }
      const bytes = typeof content === "string" ? new TextEncoder().encode(content) : content;
      const hash = await sha1(bytes);
      blobs.set(hash, bytes);
      entries.push({ name, mode: "100644", hash, type: "blob" });
    }
    for (const [name, folder] of children) {
      entries.push({ name, mode: "40000", hash: await store(folder), type: "tree" });
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    const hash = await sha1(new TextEncoder().encode(JSON.stringify(entries)));
    trees.set(hash, entries);
    return hash;
  };
  for (const [commit, files] of Object.entries(commits)) roots.set(commit, await store(files));

  const repo = {
    readCommit: async (hash: string) => {
      const treeHash = roots.get(hash);
      return treeHash ? ({ hash, treeHash } as ArtifactsCommitMetadata) : null;
    },
    readTree: async (hash: string) => trees.get(hash) ?? null,
    readBlob: async (hash: string) => {
      const bytes = blobs.get(hash);
      return bytes ? new Blob([bytes]) : null;
    },
    [Symbol.dispose]: () => {},
  } as unknown as ArtifactsRepo;
  return {
    get: async (name: string) => {
      if (name !== `mod-${codeModId}`) throw new Error(`no repo ${name}`);
      return repo;
    },
  } as unknown as Artifacts;
}
