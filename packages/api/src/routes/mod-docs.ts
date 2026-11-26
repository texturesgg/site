import { zValidator } from "@hono/zod-validator";
import { logger } from "@vgskins/logger";
import {
  docsCandidates,
  docsMinor,
  docsMinors,
  type ModDocsFile,
  ModDocsHeaderName,
  ModDocsImage,
  ModDocsIndex,
  ModDocsPage,
  type ModDocsRelease,
  ModDocsSearchIndex,
  ModDocsWanted,
} from "@vgskins/shared/mod-docs";
import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { z } from "zod";
import { getTggMeleeReleases } from "../lib/public-catalog";
import { validationHook } from "../lib/validation";
import type { Env, HonoEnv } from "../types";

// The mod docs as tgg-melee's releases (and CI on main) mirror them, served by
// the site's docs reader (the mirror sends no CORS headers). Only format 2
// indices are accepted; older format 1 releases are ignored.

/** Default mirror base URL: <version>/docs/index.json, <page>.md, images/<file>, include/tgg/<name>.h. */
export const MOD_DOCS_MIRROR = "https://dl.textures.gg/tgg-melee";
/** How many releases a docs URL tries, newest first, before it's not found. */
const MAX_CANDIDATES = 8;
/** The largest text docs file served. */
const MAX_FILE_BYTES = 1024 * 1024;
/** The largest search.json served. */
const MAX_SEARCH_BYTES = 2 * 1024 * 1024;
/** The largest image served from docs/images/. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function mirrorBase(env: Env): string {
  return (env.MOD_DOCS_MIRROR ?? MOD_DOCS_MIRROR).replace(/\/+$/, "");
}

function isMutableMirror(env: Env, version: string): boolean {
  return version === "main" || Boolean(env.MOD_DOCS_MIRROR);
}

function cacheHeader(env: Env, version: string): string {
  if (env.MOD_DOCS_MIRROR) return "no-store";
  return version === "main" ? "public, max-age=60" : "public, max-age=300";
}

async function fetchMirror(env: Env, path: string, version: string): Promise<Response | null> {
  const url = `${mirrorBase(env)}/${path}`;
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
async function mirroredText(
  env: Env,
  path: string,
  version: string,
  maxBytes = MAX_FILE_BYTES
): Promise<string | null> {
  const response = await fetchMirror(env, path, version);
  if (!response) return null;
  const text = await response.text();
  if (text.length > maxBytes) throw new Error(`The docs mirror's ${path} is too large`);
  return text;
}

/** Fetch and validate a format 2 index for a single release or `main`. */
async function loadFormat2Index(env: Env, version: string): Promise<ModDocsIndex | null> {
  const text = await mirroredText(env, `${encodeURIComponent(version)}/docs/index.json`, version);
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

type Resolved = { version: string; index: ModDocsIndex; releases: string[] };

/** The newest release `wanted` names that has format 2 docs mirrored, or null. */
async function resolve(env: Env, wanted: string): Promise<Resolved | null> {
  const releases = await getTggMeleeReleases(env);
  for (const version of docsCandidates(wanted, releases).slice(0, MAX_CANDIDATES)) {
    const index = await loadFormat2Index(env, version);
    if (!index) continue;
    return { version, index, releases };
  }
  return null;
}

/** Every major.minor with at least one format 2 docs index, newest first. */
async function format2Minors(
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
      const index = await loadFormat2Index(env, latestInMinor);
      return index ? minor : null;
    })
  );
  return checks.filter((minor): minor is string => minor !== null);
}

function imageContentType(file: string): string {
  if (file.endsWith(".webp")) return "image/webp";
  if (file.endsWith(".png")) return "image/png";
  return "image/jpeg";
}

const Wanted = z.object({ wanted: ModDocsWanted });
const PageQuery = z.object({ path: ModDocsPage });
const notFound = { error: "No docs for that version" };

const app = new Hono<HonoEnv>()
  .get(
    "/:wanted",
    describeRoute({
      tags: ["Docs"],
      summary: "The mod docs a version names",
      description:
        "`wanted` is `latest`, `main`, or a tgg-melee major.minor. Answers the newest format 2 docs index and the list of available minors.",
      responses: {
        200: { description: "The release and its format 2 index" },
        404: { description: "None" },
      },
    }),
    zValidator("param", Wanted, validationHook),
    async (c) => {
      const resolved = await resolve(c.env, c.req.valid("param").wanted);
      if (!resolved) return c.json(notFound, 404);
      const { version, index } = resolved;
      const minors = await format2Minors(c.env, resolved.releases, version);
      const body: ModDocsRelease = {
        version,
        minor: docsMinor(version),
        minors,
        nav: index.nav,
        pages: index.pages,
        headers: index.headers,
        redirects: index.redirects,
      };
      c.header("Cache-Control", cacheHeader(c.env, version));
      return c.json(body, 200);
    }
  )
  .get(
    "/:wanted/page",
    describeRoute({
      tags: ["Docs"],
      summary: "One docs page",
      description: "The page's markdown, from the release `wanted` resolves to.",
      responses: { 200: { description: "The page" }, 404: { description: "No such page" } },
    }),
    zValidator("param", Wanted, validationHook),
    zValidator("query", PageQuery, validationHook),
    async (c) => {
      const { wanted } = c.req.valid("param");
      const { path } = c.req.valid("query");
      const resolved = await resolve(c.env, wanted);
      if (!resolved || !(path in resolved.index.pages)) return c.json(notFound, 404);
      const text = await mirroredText(
        c.env,
        `${encodeURIComponent(resolved.version)}/docs/${path}.md`,
        resolved.version
      );
      if (text === null) return c.json(notFound, 404);
      const body: ModDocsFile = {
        version: resolved.version,
        minor: docsMinor(resolved.version),
        text,
      };
      c.header("Cache-Control", cacheHeader(c.env, resolved.version));
      return c.json(body, 200);
    }
  )
  .get(
    "/:wanted/headers/:name",
    describeRoute({
      tags: ["Docs"],
      summary: "One SDK header",
      description: "`tgg/<name>.h` as the release `wanted` resolves to shipped it.",
      responses: { 200: { description: "The header" }, 404: { description: "No such header" } },
    }),
    zValidator("param", Wanted.extend({ name: ModDocsHeaderName }), validationHook),
    async (c) => {
      const { wanted, name } = c.req.valid("param");
      const resolved = await resolve(c.env, wanted);
      if (!resolved || !resolved.index.headers.includes(`tgg/${name}.h`)) {
        return c.json(notFound, 404);
      }
      const text = await mirroredText(
        c.env,
        `${encodeURIComponent(resolved.version)}/docs/include/tgg/${name}.h`,
        resolved.version
      );
      if (text === null) return c.json(notFound, 404);
      const body: ModDocsFile = {
        version: resolved.version,
        minor: docsMinor(resolved.version),
        text,
      };
      c.header("Cache-Control", cacheHeader(c.env, resolved.version));
      return c.json(body, 200);
    }
  )
  .get(
    "/:wanted/images/:file",
    describeRoute({
      tags: ["Docs"],
      summary: "One docs screenshot or image",
      description: "An image from docs/images/<file> for the resolved release.",
      responses: { 200: { description: "The image" }, 404: { description: "No such image" } },
    }),
    zValidator("param", Wanted.extend({ file: ModDocsImage }), validationHook),
    async (c) => {
      const { wanted, file } = c.req.valid("param");
      const resolved = await resolve(c.env, wanted);
      if (!resolved) return c.json(notFound, 404);
      const response = await fetchMirror(
        c.env,
        `${encodeURIComponent(resolved.version)}/docs/images/${file}`,
        resolved.version
      );
      if (!response) return c.json(notFound, 404);
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > MAX_IMAGE_BYTES) {
        return c.json({ error: "Docs image is too large" }, 502);
      }
      return new Response(bytes, {
        status: 200,
        headers: {
          "Content-Type": imageContentType(file),
          "Cache-Control": isMutableMirror(c.env, resolved.version)
            ? cacheHeader(c.env, resolved.version)
            : "public, max-age=86400",
        },
      });
    }
  )
  .get(
    "/:wanted/search",
    describeRoute({
      tags: ["Docs"],
      summary: "The search index for a docs version",
      description: "Format 2 docs/search.json containing API symbols, pages, and headings.",
      responses: {
        200: { description: "The search index" },
        404: { description: "No search index" },
      },
    }),
    zValidator("param", Wanted, validationHook),
    async (c) => {
      const { wanted } = c.req.valid("param");
      const resolved = await resolve(c.env, wanted);
      if (!resolved) return c.json(notFound, 404);
      const text = await mirroredText(
        c.env,
        `${encodeURIComponent(resolved.version)}/docs/search.json`,
        resolved.version,
        MAX_SEARCH_BYTES
      );
      if (text === null) return c.json(notFound, 404);
      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch {
        logger.warn({ version: resolved.version }, "A mirrored docs search index isn't JSON");
        return c.json(notFound, 404);
      }
      const parsed = ModDocsSearchIndex.safeParse(raw);
      if (!parsed.success) {
        logger.warn(
          { version: resolved.version, issues: parsed.error.issues },
          "A mirrored docs search index isn't format 2"
        );
        return c.json(notFound, 404);
      }
      c.header("Cache-Control", cacheHeader(c.env, resolved.version));
      return c.json(parsed.data, 200);
    }
  )
  .get(
    "/:wanted/tgg.luau",
    describeRoute({
      tags: ["Docs"],
      summary: "Luau type definitions for the resolved version",
      description: "`tgg.luau` as mirrored beside the docs for luau-lsp and editors.",
      responses: {
        200: { description: "The Luau definitions file" },
        404: { description: "Not available" },
      },
    }),
    zValidator("param", Wanted, validationHook),
    async (c) => {
      const { wanted } = c.req.valid("param");
      const resolved = await resolve(c.env, wanted);
      if (!resolved) return c.json(notFound, 404);
      const text = await mirroredText(
        c.env,
        `${encodeURIComponent(resolved.version)}/docs/tgg.luau`,
        resolved.version
      );
      if (text === null) return c.json(notFound, 404);
      const download = c.req.query("download") === "1";
      return new Response(text, {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": download
            ? 'attachment; filename="tgg.luau"'
            : 'inline; filename="tgg.luau"',
          "Cache-Control": cacheHeader(c.env, resolved.version),
        },
      });
    }
  );

export default app;
