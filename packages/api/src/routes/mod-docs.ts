import { zValidator } from "@hono/zod-validator";
import { logger } from "@vgskins/logger";
import {
  docsCandidates,
  docsMinor,
  docsMinors,
  type ModDocsFile,
  ModDocsIndex,
  ModDocsPage,
  type ModDocsRelease,
  ModDocsWanted,
} from "@vgskins/shared/mod-docs";
import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { z } from "zod";
import { getTggMeleeReleases } from "../lib/public-catalog";
import { validationHook } from "../lib/validation";
import type { Env, HonoEnv } from "../types";

// The mod docs as tgg-melee's releases mirror them, for the site's docs pages
// (the mirror sends no CORS headers). A docs URL names `latest` or a
// major.minor; it shows the newest release of those whose docs are mirrored.

/** Where each release's docs are: <version>/docs/index.json, <page>.md, include/tgg/<name>.h. */
export const MOD_DOCS_MIRROR = "https://dl.textures.gg/tgg-melee";
/** How many releases a docs URL tries, newest first, before it's not found. */
const MAX_CANDIDATES = 8;
/** The largest docs file served. */
const MAX_FILE_BYTES = 1024 * 1024;
const CACHE = "public, max-age=300";

/** A file from the mirror, or null when it isn't there. Mirrored files never change. */
async function mirrored(path: string): Promise<string | null> {
  const response = await fetch(`${MOD_DOCS_MIRROR}/${path}`, {
    cf: { cacheEverything: true, cacheTtlByStatus: { "200-299": 86400, "404": 300 } },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`The docs mirror answered ${response.status} for ${path}`);
  const text = await response.text();
  if (text.length > MAX_FILE_BYTES) throw new Error(`The docs mirror's ${path} is too large`);
  return text;
}

type Resolved = { version: string; index: ModDocsIndex; releases: string[] };

/** The newest release `wanted` names that has its docs mirrored, or null. */
async function resolve(env: Env, wanted: string): Promise<Resolved | null> {
  const releases = await getTggMeleeReleases(env);
  for (const version of docsCandidates(wanted, releases).slice(0, MAX_CANDIDATES)) {
    const text = await mirrored(`${encodeURIComponent(version)}/docs/index.json`);
    if (text === null) continue;
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      logger.warn({ version }, "A mirrored docs index isn't JSON");
      continue;
    }
    const index = ModDocsIndex.safeParse(raw);
    if (!index.success) {
      logger.warn({ version, issues: index.error.issues }, "A mirrored docs index doesn't parse");
      continue;
    }
    return { version, index: index.data, releases };
  }
  return null;
}

const Wanted = z.object({ wanted: ModDocsWanted });
const notFound = { error: "No docs for that version" };

const app = new Hono<HonoEnv>()
  .get(
    "/:wanted",
    describeRoute({
      tags: ["Docs"],
      summary: "The mod docs a version names",
      description:
        "`wanted` is `latest` or a tgg-melee major.minor. Answers the newest release of those whose docs are mirrored: `{version, minor, minors, pages, headers}`, where `minors` is every major.minor with releases, newest first.",
      responses: {
        200: { description: "The release and its pages" },
        404: { description: "None" },
      },
    }),
    zValidator("param", Wanted, validationHook),
    async (c) => {
      const resolved = await resolve(c.env, c.req.valid("param").wanted);
      if (!resolved) return c.json(notFound, 404);
      const body: ModDocsRelease = {
        version: resolved.version,
        minor: docsMinor(resolved.version),
        minors: docsMinors(resolved.releases),
        pages: resolved.index.pages,
        headers: resolved.index.headers,
      };
      c.header("Cache-Control", CACHE);
      return c.json(body, 200);
    }
  )
  .get(
    "/:wanted/pages/:page",
    describeRoute({
      tags: ["Docs"],
      summary: "One docs page",
      description: "The page's markdown, from the release `wanted` resolves to.",
      responses: { 200: { description: "The page" }, 404: { description: "No such page" } },
    }),
    zValidator("param", Wanted.extend({ page: ModDocsPage }), validationHook),
    async (c) => {
      const { wanted, page } = c.req.valid("param");
      const resolved = await resolve(c.env, wanted);
      if (!resolved || !resolved.index.pages.includes(page)) return c.json(notFound, 404);
      const text = await mirrored(`${encodeURIComponent(resolved.version)}/docs/${page}.md`);
      if (text === null) return c.json(notFound, 404);
      const body: ModDocsFile = {
        version: resolved.version,
        minor: docsMinor(resolved.version),
        text,
      };
      c.header("Cache-Control", CACHE);
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
    zValidator("param", Wanted.extend({ name: ModDocsPage }), validationHook),
    async (c) => {
      const { wanted, name } = c.req.valid("param");
      const resolved = await resolve(c.env, wanted);
      if (!resolved || !resolved.index.headers.includes(`tgg/${name}.h`)) {
        return c.json(notFound, 404);
      }
      const text = await mirrored(
        `${encodeURIComponent(resolved.version)}/docs/include/tgg/${name}.h`
      );
      if (text === null) return c.json(notFound, 404);
      const body: ModDocsFile = {
        version: resolved.version,
        minor: docsMinor(resolved.version),
        text,
      };
      c.header("Cache-Control", CACHE);
      return c.json(body, 200);
    }
  );

export default app;
