import { ModDocsImage, type ModDocsRelease } from "@vgskins/shared/mod-docs";
import type { MarkdownLink } from "@/ui/patterns/Markdown";
import { API_BASE_URL } from "./config";

// Links inside the mod docs are written for the docs/ folder of tgg-melee
// (../concepts/sim-and-view.md#state, ../../mods/include/tgg/draw.h,
// ../images/hud-overlay.webp). On the site they resolve relative to the
// current page and version being read.

/** The site path of a docs page: `index` is the version's front page. */
export function docsPagePath(wanted: string, page: string): string {
  return page === "index" ? `/docs/mods/${wanted}` : `/docs/mods/${wanted}/${page}`;
}

/** The site path of an SDK header's page, for tgg/<name>.h. */
export function docsHeaderPath(wanted: string, name: string): string {
  return `/docs/mods/${wanted}/api/${name}`;
}

/** The API URL serving a docs image under docs/images/<file>. */
export function docsImageUrl(wanted: string, file: string): string {
  return `${API_BASE_URL}/api/docs/mods/${encodeURIComponent(wanted)}/images/${encodeURIComponent(file)}`;
}

/** Normalize a POSIX relative path against a base directory (e.g. "guides" + "../concepts/a.md"). */
function resolveRelative(baseDir: string, rel: string): string {
  const stack = baseDir ? baseDir.split("/").filter(Boolean) : [];
  for (const part of rel.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") stack.pop();
    else stack.push(part);
  }
  return stack.join("/");
}

function pageDir(page: string): string {
  const slash = page.lastIndexOf("/");
  return slash === -1 ? "" : page.slice(0, slash);
}

const HEADER_SUFFIX = /(?:^|\/)(?:mods\/)?include\/(tgg\/([A-Za-z0-9_-]+)\.h)$/;
const SITE_ORIGIN = /^https:\/\/textures\.gg(\/.*)$/;

/**
 * Where a link on `page` goes: other sites open in a new tab, links to
 * textures.gg or to docs pages and headers in this release navigate in-app,
 * and repository-only paths are rendered as plain text.
 */
export function resolveDocsLink(
  href: string,
  wanted: string,
  page: string,
  release: Pick<ModDocsRelease, "pages" | "headers">
): MarkdownLink {
  const siteMatch = SITE_ORIGIN.exec(href);
  if (siteMatch) return { to: "site", href: siteMatch[1] };
  if (/^(https?:|mailto:)/i.test(href)) return { to: "external", href };
  if (href.startsWith("/")) return { to: "site", href };

  const hashAt = href.indexOf("#");
  const rawPath = hashAt === -1 ? href : href.slice(0, hashAt);
  const hash = hashAt === -1 ? "" : href.slice(hashAt);

  if (rawPath === "") return { to: "site", href: `${docsPagePath(wanted, page)}${hash}` };

  const headerMatch = HEADER_SUFFIX.exec(rawPath);
  if (headerMatch && release.headers.includes(headerMatch[1])) {
    return { to: "site", href: `${docsHeaderPath(wanted, headerMatch[2])}${hash}` };
  }

  if (rawPath.endsWith(".md")) {
    const resolved = resolveRelative(pageDir(page), rawPath);
    const targetPage = resolved.slice(0, -".md".length);
    if (targetPage in release.pages) {
      return { to: "site", href: `${docsPagePath(wanted, targetPage)}${hash}` };
    }
  }

  return null;
}

/**
 * Resolve a markdown image `src` relative to `page` into the API's image URL,
 * or null if it does not point to a valid file under `docs/images/`.
 */
export function resolveDocsImage(src: string, wanted: string, page: string): string | null {
  if (/^(https?:|data:|mailto:|\/)/i.test(src)) return null;
  const resolved = resolveRelative(pageDir(page), src);
  if (!resolved.startsWith("images/")) return null;
  const file = resolved.slice("images/".length);
  if (!ModDocsImage.safeParse(file).success) return null;
  return docsImageUrl(wanted, file);
}

/**
 * Remove YAML frontmatter and an optional leading `# Title` H1 from a docs
 * markdown document, because the reader renders `title` and `description` from
 * the format 2 index above the body.
 */
export function stripDocsFrontmatter(raw: string): string {
  let body = raw.replace(/\r\n/g, "\n");
  if (body.startsWith("---\n")) {
    const end = body.indexOf("\n---\n", 4);
    if (end !== -1) {
      body = body.slice(end + "\n---\n".length);
    } else if (body.endsWith("\n---")) {
      body = "";
    }
  }
  body = body.replace(/^\n+/, "");
  if (body.startsWith("# ")) {
    const nl = body.indexOf("\n");
    body = nl === -1 ? "" : body.slice(nl + 1).replace(/^\n+/, "");
  }
  return body;
}
