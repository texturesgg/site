import { z } from "zod";

// The mod docs: tgg-melee's docs/**/*.md, images, and SDK headers as each
// release (and CI on main) mirrors them to dl.textures.gg/tgg-melee/<version>/docs/,
// served by textures.gg at /docs/mods/<major.minor | latest | main>/<page>.

/** A docs page: a nested path under docs/ without `.md` (index, start/quickstart, guides/hud). */
export const ModDocsPage = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/);

/** An SDK header, as the index lists it: tgg/<name>.h. */
export const ModDocsHeader = z.string().regex(/^tgg\/[A-Za-z0-9_-]{1,64}\.h$/);

/** The header name segment of `tgg/<name>.h`. */
export const ModDocsHeaderName = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

/** An image file under docs/images/. */
export const ModDocsImage = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_.-]+\.(?:webp|png|jpe?g)$/);

/** What a docs URL asks for: `latest`, `main`, or a release's major.minor. */
export const ModDocsWanted = z.string().regex(/^(latest|main|\d{1,4}\.\d{1,4})$/);

/** One heading extracted by docs-index.py; the site uses `id` as given. */
export const ModDocsHeading = z.object({
  depth: z.number().int().min(1).max(6),
  id: z.string().min(1).max(160),
  text: z.string().min(1).max(200),
});
export type ModDocsHeading = z.infer<typeof ModDocsHeading>;

/** Metadata for one docs page from frontmatter and headings. */
export const ModDocsPageMeta = z.object({
  title: z.string().min(1).max(120),
  label: z.string().min(1).max(80).optional(),
  description: z.string().min(1).max(300),
  headings: z.array(ModDocsHeading).max(500),
});
export type ModDocsPageMeta = z.infer<typeof ModDocsPageMeta>;

/** A group of pages in reading order, for the contents (Start, Guides, Native C). */
export const ModDocsNavSection = z.object({
  title: z.string().min(1).max(80),
  advanced: z.boolean().optional(),
  pages: z.array(ModDocsPage).max(500),
});
export type ModDocsNavSection = z.infer<typeof ModDocsNavSection>;

/** A release's format 2 docs/index.json on the mirror. */
export const ModDocsIndex = z.object({
  format: z.literal(2),
  version: z.string(),
  nav: z.array(ModDocsNavSection).max(50),
  pages: z.record(ModDocsPage, ModDocsPageMeta),
  headers: z.array(ModDocsHeader).max(500),
  redirects: z.record(z.string(), z.string()).default({}),
});
export type ModDocsIndex = z.infer<typeof ModDocsIndex>;

/** GET /api/docs/mods/:wanted: the release a docs URL resolves to and its contents. */
export const ModDocsRelease = z.object({
  version: z.string(),
  minor: z.string(),
  /** Every major.minor with format 2 docs, newest first, for a version picker. */
  minors: z.array(z.string()),
  nav: z.array(ModDocsNavSection),
  pages: z.record(ModDocsPage, ModDocsPageMeta),
  headers: z.array(ModDocsHeader),
  redirects: z.record(z.string(), z.string()),
});
export type ModDocsRelease = z.infer<typeof ModDocsRelease>;

/** GET /api/docs/mods/:wanted/page and .../headers/:name: one file. */
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

/** A release's major.minor: "1.0" for 1.0.0-rc.1, and "main" for main. */
export function docsMinor(version: string): string {
  if (version === "main") return "main";
  return version.split(".").slice(0, 2).join(".");
}

/**
 * The releases a docs URL could show, best first: `main` resolves directly,
 * `latest` tries every release, and a major.minor tries that minor's. Releases
 * come before prereleases, then newest first.
 */
export function docsCandidates(wanted: string, releases: string[]): string[] {
  if (wanted === "main") return ["main"];
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

/** Short label for a page in the sidebar and prev/next links. */
export function docsPageLabel(page: string, pages: Record<string, ModDocsPageMeta>): string {
  const meta = pages[page];
  if (meta) return meta.label ?? meta.title;
  return page;
}

/** The nav section containing `page`, if any. */
export function docsPageSection(
  page: string,
  nav: readonly ModDocsNavSection[]
): ModDocsNavSection | undefined {
  return nav.find((section) => section.pages.includes(page));
}

/**
 * Previous and next pages in reading order. Standard (non-advanced) sections
 * form one continuous path; advanced sections (Native C) form their own path
 * so readers do not fall into native C at the end of Reference.
 */
export function docsPrevNext(
  page: string,
  nav: readonly ModDocsNavSection[]
): { prev: string | null; next: string | null } {
  const current = docsPageSection(page, nav);
  if (!current) return { prev: null, next: null };
  const inAdvanced = Boolean(current.advanced);
  const track = nav
    .filter((section) => Boolean(section.advanced) === inAdvanced)
    .flatMap((section) => section.pages);
  const idx = track.indexOf(page);
  if (idx === -1) return { prev: null, next: null };
  return {
    prev: idx > 0 ? track[idx - 1] : null,
    next: idx + 1 < track.length ? track[idx + 1] : null,
  };
}

/**
 * Resolve a redirect for `page` and optional `hash` (without leading `#`).
 * Exact `page#hash` entries take precedence over plain `page` entries.
 */
export function docsResolveRedirect(
  redirects: Record<string, string>,
  page: string,
  hash = ""
): { page: string; hash: string } | null {
  const cleanHash = hash.replace(/^#/, "");
  const exact = cleanHash ? redirects[`${page}#${cleanHash}`] : undefined;
  const target = exact ?? redirects[page];
  if (!target) return null;
  const hashAt = target.indexOf("#");
  if (hashAt !== -1) {
    return { page: target.slice(0, hashAt), hash: target.slice(hashAt + 1) };
  }
  return { page: target, hash: cleanHash };
}
