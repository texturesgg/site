import { zValidator } from "@hono/zod-validator";
import { logger } from "@vgskins/logger";
import {
  docsMinor,
  type ModDocsFile,
  ModDocsHeaderName,
  ModDocsImage,
  ModDocsPage,
  type ModDocsRelease,
  ModDocsSearchIndex,
  ModDocsWanted,
} from "@vgskins/shared/mod-docs";
import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { z } from "zod";
import {
  docsCacheHeader,
  fetchDocsMirror,
  format2DocsMinors,
  isMutableMirror,
  MOD_DOCS_MIRROR,
  mirroredDocsText,
  resolveModDocs,
} from "../lib/mod-docs-mirror";
import { validationHook } from "../lib/validation";
import type { HonoEnv } from "../types";

export { MOD_DOCS_MIRROR };

// The mod docs as tgg-melee's releases (and CI on main) mirror them, served by
// the site's docs reader (the mirror sends no CORS headers). Only format 2
// indices are accepted; older format 1 releases are ignored.

/** The largest search.json served. */
const MAX_SEARCH_BYTES = 2 * 1024 * 1024;
/** The largest image served from docs/images/. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

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
      const resolved = await resolveModDocs(c.env, c.req.valid("param").wanted);
      if (!resolved) return c.json(notFound, 404);
      const { version, index } = resolved;
      const minors = await format2DocsMinors(c.env, resolved.releases, version);
      const body: ModDocsRelease = {
        version,
        minor: docsMinor(version),
        minors,
        nav: index.nav,
        pages: index.pages,
        headers: index.headers,
        redirects: index.redirects,
      };
      c.header("Cache-Control", docsCacheHeader(c.env, version));
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
      const resolved = await resolveModDocs(c.env, wanted);
      if (!resolved || !(path in resolved.index.pages)) return c.json(notFound, 404);
      const text = await mirroredDocsText(
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
      c.header("Cache-Control", docsCacheHeader(c.env, resolved.version));
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
      const resolved = await resolveModDocs(c.env, wanted);
      if (!resolved || !resolved.index.headers.includes(`tgg/${name}.h`)) {
        return c.json(notFound, 404);
      }
      const text = await mirroredDocsText(
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
      c.header("Cache-Control", docsCacheHeader(c.env, resolved.version));
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
      const resolved = await resolveModDocs(c.env, wanted);
      if (!resolved) return c.json(notFound, 404);
      const response = await fetchDocsMirror(
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
            ? docsCacheHeader(c.env, resolved.version)
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
      const resolved = await resolveModDocs(c.env, wanted);
      if (!resolved) return c.json(notFound, 404);
      const text = await mirroredDocsText(
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
      c.header("Cache-Control", docsCacheHeader(c.env, resolved.version));
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
      const resolved = await resolveModDocs(c.env, wanted);
      if (!resolved) return c.json(notFound, 404);
      const text = await mirroredDocsText(
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
          "Cache-Control": docsCacheHeader(c.env, resolved.version),
        },
      });
    }
  )
  .get(
    "/:wanted/llms.txt",
    describeRoute({
      tags: ["Docs"],
      summary: "llmstxt.org directory of the mod docs",
      description: "`llms.txt` listing every docs page's markdown URL for coding agents.",
      responses: {
        200: { description: "The llms.txt directory" },
        404: { description: "Not available" },
      },
    }),
    zValidator("param", Wanted, validationHook),
    async (c) => {
      const { wanted } = c.req.valid("param");
      const resolved = await resolveModDocs(c.env, wanted);
      if (!resolved) return c.json(notFound, 404);
      const text = await mirroredDocsText(
        c.env,
        `${encodeURIComponent(resolved.version)}/docs/llms.txt`,
        resolved.version
      );
      if (text === null) return c.json(notFound, 404);
      return new Response(text, {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": docsCacheHeader(c.env, resolved.version),
        },
      });
    }
  );

export default app;
