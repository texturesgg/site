// The mod docs every tgg-melee build links to:
// /docs/mods/<major.minor | latest>[/<page>]. Until textures.gg serves them
// itself, each URL redirects to that page in the newest tgg-melee release of
// its minor (of all, for `latest`), on GitHub. Before a minor's first
// release, its newest prerelease stands in.

const DOCS_PATH = /^\/docs\/mods\/(latest|\d+\.\d+)(?:\/([^/]*))?\/?$/;
// A file of the docs folder without `.md`: hooks, writing-mods, README.
const PAGE = /^[A-Za-z0-9_-]+$/;
const RELEASE = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

/** Whether `pathname` is under /docs/mods/, so the Worker answers it. */
export function isModDocsPath(pathname: string): boolean {
  return pathname === "/docs/mods" || pathname.startsWith("/docs/mods/");
}

type Version = { text: string; parts: number[]; pre: string[] | null };

function parse(text: string): Version | null {
  const match = RELEASE.exec(text);
  if (!match) return null;
  return { text, parts: match.slice(1, 4).map(Number), pre: match[4]?.split(".") ?? null };
}

/** Semantic version order: a release comes after its prereleases. */
function isNewer(a: Version, b: Version): boolean {
  const i = a.parts.findIndex((part, j) => part !== b.parts[j]);
  if (i !== -1) return a.parts[i] > b.parts[i];
  if (!a.pre || !b.pre) return !a.pre && !!b.pre;
  for (let j = 0; j < Math.max(a.pre.length, b.pre.length); j++) {
    const [x, y] = [a.pre[j], b.pre[j]];
    if (x === undefined) return false;
    if (y === undefined) return true;
    if (x === y) continue;
    const [nx, ny] = [/^\d+$/.test(x), /^\d+$/.test(y)];
    if (nx && ny) return Number(x) > Number(y);
    if (nx !== ny) return ny;
    return x > y;
  }
  return false;
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

  let newest: Version | null = null;
  for (const release of releases) {
    const version = parse(release);
    if (!version) continue;
    if (wanted !== "latest" && `${version.parts[0]}.${version.parts[1]}` !== wanted) continue;
    // A release wins over every prerelease, so a later prerelease of the
    // next patch doesn't take the docs from the release.
    const better =
      !newest ||
      (!version.pre && newest.pre) ||
      (!!version.pre === !!newest.pre && isNewer(version, newest));
    if (better) newest = version;
  }
  if (!newest) return null;
  return `https://github.com/texturesgg/tgg-melee/blob/v${newest.text}/docs/${page}.md`;
}
