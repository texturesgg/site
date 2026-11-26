import type { ModDocsRelease } from "@vgskins/shared/mod-docs";
import type { MarkdownLink } from "@/ui/patterns/Markdown";

// Links inside the mod docs are written for the docs folder of the tgg-melee
// repository (hooks.md#statics, ../mods/include/tgg/mod.h). On the site they
// go to the same page here, for the version being read.

/** The site path of a docs page: README is the version's front page. */
export function docsPagePath(wanted: string, page: string): string {
  return page === "README" ? `/docs/mods/${wanted}` : `/docs/mods/${wanted}/${page}`;
}

/** The site path of an SDK header's page, for tgg/<name>.h. */
export function docsHeaderPath(wanted: string, name: string): string {
  return `/docs/mods/${wanted}/api/${name}`;
}

const PAGE = /^(?:\.\/)?([A-Za-z0-9_-]+)\.md$/;
const HEADER = /^(?:\.\.\/mods\/)?include\/(tgg\/([A-Za-z0-9_-]+)\.h)$/;

/**
 * Where a link on `page` goes: other sites open as they are, docs pages and
 * headers this release has go to their page here, and anything else (a
 * folder of the repository) is left as text.
 */
export function resolveDocsLink(
  href: string,
  wanted: string,
  page: string,
  release: Pick<ModDocsRelease, "pages" | "headers">
): MarkdownLink {
  if (/^(https?:|mailto:)/i.test(href)) return { to: "external", href };
  const hashAt = href.indexOf("#");
  const path = hashAt === -1 ? href : href.slice(0, hashAt);
  const hash = hashAt === -1 ? "" : href.slice(hashAt);
  if (path === "") return { to: "site", href: `${docsPagePath(wanted, page)}${hash}` };
  const pageMatch = PAGE.exec(path);
  if (pageMatch && release.pages.includes(pageMatch[1])) {
    return { to: "site", href: `${docsPagePath(wanted, pageMatch[1])}${hash}` };
  }
  const headerMatch = HEADER.exec(path);
  if (headerMatch && release.headers.includes(headerMatch[1])) {
    return { to: "site", href: `${docsHeaderPath(wanted, headerMatch[2])}${hash}` };
  }
  return null;
}

const PAGE_LABELS: Record<string, string> = {
  README: "Overview",
  "scripts-getting-started": "Getting started",
  "getting-started": "Getting started (C)",
};

/** A page's name in the docs' contents: "scripts-getting-started" is "Getting started". */
export function docsPageLabel(page: string): string {
  const known = PAGE_LABELS[page];
  if (known) return known;
  const words = page.replace(/[-_]+/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
