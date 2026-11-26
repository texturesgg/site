import { codeModLayouts, createDb } from "@vgskins/db";
import { logger } from "@vgskins/logger";
import { docsCandidates, docsMinor, docsMinors, ModDocsIndex } from "@vgskins/shared/mod-docs";
import { eq } from "drizzle-orm";
import type { Env } from "../types";

// The mod docs as tgg-melee's releases (and CI on main) mirror them.
// Only format 2 indices are accepted; older format 1 releases are ignored.

/** Default mirror base URL: <version>/docs/index.json, <page>.md, images/<file>, include/tgg/<name>.h. */
export const MOD_DOCS_MIRROR = "https://dl.textures.gg/tgg-melee";
/** How many releases a docs URL tries, newest first, before it's not found. */
const MAX_CANDIDATES = 8;
/** The largest text docs file served. */
export const MAX_DOCS_FILE_BYTES = 1024 * 1024;

export function isMutableMirror(env: Env, version: string): boolean {
  return version === "main" || Boolean(env.MOD_DOCS_MIRROR);
}

export function docsCacheHeader(env: Env, version: string): string {
  if (env.MOD_DOCS_MIRROR) return "no-store";
  return version === "main" ? "public, max-age=60" : "public, max-age=300";
}

export async function fetchDocsMirror(
  env: Env,
  path: string,
  version: string
): Promise<Response | null> {
  const base = (env.MOD_DOCS_MIRROR ?? MOD_DOCS_MIRROR).replace(/\/+$/, "");
  const url = `${base}/${path}`;
  const init: RequestInit = env.MOD_DOCS_MIRROR
    ? {}
    : {
        cf: {
          cacheEverything: true,
          cacheTtlByStatus:
            version === "main" ? { "200-299": 60, "404": 30 } : { "200-299": 86400, "404": 300 },
        },
      };
  const response = await fetch(url, init);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`The docs mirror answered ${response.status} for ${path}`);
  return response;
}

/** A UTF-8 file from the mirror, or null when it isn't there. */
export async function mirroredDocsText(
  env: Env,
  path: string,
  version: string,
  maxBytes = MAX_DOCS_FILE_BYTES
): Promise<string | null> {
  const response = await fetchDocsMirror(env, path, version);
  if (!response) return null;
  const text = await response.text();
  if (text.length > maxBytes) throw new Error(`The docs mirror's ${path} is too large`);
  return text;
}

/** Fetch and validate a format 2 index for a single release or `main`. */
export async function loadFormat2DocsIndex(
  env: Env,
  version: string
): Promise<ModDocsIndex | null> {
  const text = await mirroredDocsText(
    env,
    `${encodeURIComponent(version)}/docs/index.json`,
    version
  );
  if (text === null) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    logger.warn({ version }, "A mirrored docs index isn't JSON");
    return null;
  }
  const parsed = ModDocsIndex.safeParse(raw);
  if (!parsed.success) {
    logger.warn({ version, issues: parsed.error.issues }, "A mirrored docs index isn't format 2");
    return null;
  }
  return parsed.data;
}

/**
 * Every tgg-melee release the registry has a layout for, active or retired:
 * the versions whose docs textures.gg links to.
 */
export async function getTggMeleeReleases(env: Env): Promise<string[]> {
  const rows = await createDb(env.DB)
    .select({ version: codeModLayouts.portVersion })
    .from(codeModLayouts)
    .where(eq(codeModLayouts.port, "tgg-melee"));
  return rows.map((row) => row.version);
}

export type ResolvedModDocs = { version: string; index: ModDocsIndex; releases: string[] };

/** The newest release `wanted` names that has format 2 docs mirrored, or null. */
export async function resolveModDocs(env: Env, wanted: string): Promise<ResolvedModDocs | null> {
  const releases = await getTggMeleeReleases(env);
  for (const version of docsCandidates(wanted, releases).slice(0, MAX_CANDIDATES)) {
    const index = await loadFormat2DocsIndex(env, version);
    if (!index) continue;
    return { version, index, releases };
  }
  return null;
}

/** Every major.minor with at least one format 2 docs index, newest first. */
export async function format2DocsMinors(
  env: Env,
  releases: string[],
  knownVersion?: string
): Promise<string[]> {
  const knownMinor = knownVersion && knownVersion !== "main" ? docsMinor(knownVersion) : null;
  const minors = docsMinors(releases);
  const checks = await Promise.all(
    minors.map(async (minor) => {
      if (minor === knownMinor) return minor;
      const latestInMinor = docsCandidates(minor, releases)[0];
      if (!latestInMinor) return null;
      const index = await loadFormat2DocsIndex(env, latestInMinor);
      return index ? minor : null;
    })
  );
  return checks.filter((minor): minor is string => minor !== null);
}

/** Every page in a format 2 index in nav order (`index` first, then nav sections, then any extras). */
export function orderedDocsPages(index: ModDocsIndex): string[] {
  const seen = new Set<string>();
  const pages: string[] = [];
  const push = (page: string) => {
    if (seen.has(page) || !(page in index.pages)) return;
    seen.add(page);
    pages.push(page);
  };
  push("index");
  for (const section of index.nav) {
    for (const page of section.pages) push(page);
  }
  for (const page of Object.keys(index.pages)) push(page);
  return pages;
}
