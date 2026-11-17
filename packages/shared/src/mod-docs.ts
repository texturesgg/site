import { z } from "zod";

// The mod docs: tgg-melee's docs/*.md and SDK headers as each release mirrors
// them to dl.textures.gg/tgg-melee/<version>/docs/ (its release workflow),
// served by textures.gg at /docs/mods/<major.minor | latest>/<page>. The game,
// the SDK headers and tgg link those URLs, with #anchors from the headings.

/** A docs page: a file of the docs folder without `.md` (hooks, writing-mods, README). */
export const ModDocsPage = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
/** An SDK header, as the index lists it: tgg/<name>.h. */
export const ModDocsHeader = z.string().regex(/^tgg\/[A-Za-z0-9_-]{1,64}\.h$/);
/** What a docs URL asks for: `latest`, or a release's major.minor. */
export const ModDocsWanted = z.string().regex(/^(latest|\d{1,4}\.\d{1,4})$/);

/** A release's docs/index.json on the mirror. */
export const ModDocsIndex = z.object({
  format: z.literal(1),
  version: z.string(),
  pages: z.array(ModDocsPage).max(500),
  headers: z.array(ModDocsHeader).max(500),
});
export type ModDocsIndex = z.infer<typeof ModDocsIndex>;

/** GET /api/docs/mods/:wanted: the release a docs URL resolves to and its contents. */
export const ModDocsRelease = z.object({
  version: z.string(),
  minor: z.string(),
  /** Every major.minor with docs, newest first, for a version picker. */
  minors: z.array(z.string()),
  pages: z.array(ModDocsPage),
  headers: z.array(ModDocsHeader),
});
export type ModDocsRelease = z.infer<typeof ModDocsRelease>;

/** GET /api/docs/mods/:wanted/pages/:page and .../headers/:name: one file. */
export const ModDocsFile = z.object({ version: z.string(), minor: z.string(), text: z.string() });
export type ModDocsFile = z.infer<typeof ModDocsFile>;

const RELEASE = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

type Version = { text: string; parts: number[]; pre: string[] | null };

function parse(text: string): Version | null {
  const match = RELEASE.exec(text);
  if (!match) return null;
  return { text, parts: match.slice(1, 4).map(Number), pre: match[4]?.split(".") ?? null };
}

/** Semantic version order: a release comes after its prereleases. */
function compare(a: Version, b: Version): number {
  const i = a.parts.findIndex((part, j) => part !== b.parts[j]);
  if (i !== -1) return a.parts[i] - b.parts[i];
  if (!a.pre || !b.pre) return Number(!a.pre) - Number(!b.pre);
  for (let j = 0; j < Math.max(a.pre.length, b.pre.length); j++) {
    const [x, y] = [a.pre[j], b.pre[j]];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x === y) continue;
    const [nx, ny] = [/^\d+$/.test(x), /^\d+$/.test(y)];
    if (nx && ny) return Number(x) - Number(y);
    if (nx !== ny) return nx ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return 0;
}

/** A release's major.minor: "0.1" for 0.1.0-rc.12. */
export function docsMinor(version: string): string {
  return version.split(".").slice(0, 2).join(".");
}

/**
 * The releases a docs URL could show, best first: for `latest` every release,
 * for a major.minor that minor's. Releases come before prereleases (a later
 * prerelease of the next patch doesn't take the docs from a release), then
 * newest first. The caller shows the first one that has its docs mirrored.
 */
export function docsCandidates(wanted: string, releases: string[]): string[] {
  const versions = releases
    .map(parse)
    .filter((version): version is Version => version !== null)
    .filter((version) => wanted === "latest" || docsMinor(version.text) === wanted);
  versions.sort((a, b) => Number(!a.pre) - Number(!b.pre) || compare(a, b));
  return [...new Set(versions.reverse().map((version) => version.text))];
}

/** Every major.minor among `releases`, newest first. */
export function docsMinors(releases: string[]): string[] {
  const newest = new Map<string, Version>();
  for (const text of releases) {
    const version = parse(text);
    if (!version) continue;
    const minor = docsMinor(text);
    const seen = newest.get(minor);
    if (!seen || compare(version, seen) > 0) newest.set(minor, version);
  }
  return [...newest.entries()].sort(([, a], [, b]) => compare(b, a)).map(([minor]) => minor);
}
