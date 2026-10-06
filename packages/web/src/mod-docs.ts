// The mod docs every tgg-melee build links to:
// /docs/mods/<major.minor | latest>[/<page>]. Until textures.gg serves them
// itself, each URL redirects to that page in the newest tgg-melee release of
// its minor (of all, for `latest`), on GitHub.

const DOCS_PATH = /^\/docs\/mods\/(latest|\d+\.\d+)(?:\/([^/]*))?\/?$/;
const PAGE = /^[a-z0-9-]+$/;
const RELEASE = /^(\d+)\.(\d+)\.(\d+)$/;

/** Whether `pathname` is under /docs/mods/, so the Worker answers it. */
export function isModDocsPath(pathname: string): boolean {
  return pathname === "/docs/mods" || pathname.startsWith("/docs/mods/");
}

/** Whether version `a` comes after `b`, both as [major, minor, patch]. */
function isNewer(a: number[], b: number[]): boolean {
  const i = a.findIndex((part, j) => part !== b[j]);
  return i !== -1 && a[i] > b[i];
}

/**
 * Where a docs URL goes, given the tgg-melee release versions the registry
 * knows; null (a 404) for a path that names no page or no known release.
 */
export function modDocsLocation(pathname: string, releases: string[]): string | null {
  const match = DOCS_PATH.exec(pathname);
  if (!match) return null;
  const [, wanted, named] = match;
  if (named && !PAGE.test(named)) return null;
  const page = named || "README";

  let newest: number[] | null = null;
  for (const release of releases) {
    const parts = RELEASE.exec(release)?.slice(1).map(Number);
    if (!parts) continue;
    if (wanted !== "latest" && `${parts[0]}.${parts[1]}` !== wanted) continue;
    if (!newest || isNewer(parts, newest)) {
      newest = parts;
    }
  }
  if (!newest) return null;
  return `https://github.com/texturesgg/tgg-melee/blob/v${newest.join(".")}/docs/${page}.md`;
}
