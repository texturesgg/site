import { zValidator } from "@hono/zod-validator";
import {
  codeModBuilds,
  codeModLayouts,
  codeModReleases,
  codeModSetMods,
  codeModSets,
  codeMods,
  createDb,
} from "@vgskins/db";
import { and, asc, eq, isNull, or } from "drizzle-orm";
import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { z } from "zod";
import { validationHook } from "../lib/validation";
import type { HonoEnv } from "../types";

// The catalog format tgg-mod reads (its `catalog::SCHEMA`).
const CATALOG_SCHEMA = 1;
// Sets and the catalog change when an admin edits a set or a release is
// approved or built; a minute's staleness is fine for both.
const LISTING_CACHE = "public, max-age=60";

/** A release version for ordering: major, minor and patch, and its pre-release. */
function versionKey(version: string): { core: number[]; pre: string | null } {
  const [core, ...pre] = version.split("+")[0].split("-");
  const parts = core.split(".").map((part) => Number(part) || 0);
  return { core: [0, 1, 2].map((i) => parts[i] ?? 0), pre: pre.length ? pre.join("-") : null };
}

/** Newest first; a pre-release comes after (is older than) its release. */
function byVersionDescending(a: string, b: string): number {
  const [x, y] = [versionKey(a), versionKey(b)];
  const part = x.core.findIndex((value, i) => value !== y.core[i]);
  if (part !== -1) return y.core[part] - x.core[part];
  if (x.pre === y.pre) return 0;
  if (x.pre === null) return -1;
  if (y.pre === null) return 1;
  return y.pre.localeCompare(x.pre, "en", { numeric: true });
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The URL a package is served at: by its SHA-256, so it never changes. */
function packageUrl(origin: string, sha256: string): string {
  return `${origin}/api/registry/packages/${sha256}.zip`;
}

// The registry players' installers read: tgg-mod (the textures.gg app and the
// `tgg` command line) and later an in-game mod browser
// (core docs/mod-distribution.md). Everything here is public, unauthenticated
// and the same for every reader, and shows approved releases only, so it sits
// outside the code mods flag. Admins edit sets in routes/admin.ts.
const app = new Hono<HonoEnv>()
  // Every set: a named, curated list of mods and the ranges it takes them in
  .get(
    "/sets",
    describeRoute({
      tags: ["Registry"],
      summary: "List mod sets",
      description:
        "Every set: `{name, title, description, version, mods: [{id, range}]}`, ranges in the game's `depends` syntax. `version` goes up whenever the list or a range changes.",
      responses: { 200: { description: "Every set" } },
    }),
    async (c) => {
      const db = createDb(c.env.DB);
      const [sets, mods] = await Promise.all([
        db.select().from(codeModSets).orderBy(asc(codeModSets.name)),
        db
          .select()
          .from(codeModSetMods)
          .orderBy(asc(codeModSetMods.setName), asc(codeModSetMods.position)),
      ]);
      c.header("Cache-Control", LISTING_CACHE);
      return c.json(
        sets.map((set) => ({
          name: set.name,
          title: set.title,
          description: set.description,
          version: set.version,
          mods: mods
            .filter((mod) => mod.setName === set.name)
            .map((mod) => ({ id: mod.mod, range: mod.range })),
        })),
        200
      );
    }
  )

  // The catalog for one game layout: every approved release with a build for
  // it, in the format tgg-mod reads
  .get(
    "/catalog",
    describeRoute({
      tags: ["Registry"],
      summary: "Get the mod catalog for a game layout",
      description:
        "tgg-mod's catalog (schema 1) for `layout`, a port's game layout id: every approved release with a successful build for it, newest first per mod. Each entry is the packed manifest with `netplay` and `package: {url, sha256, size}`; package URLs are content-addressed and immutable. `snapshot` names this state of the catalog. An unknown layout has no mods.",
      parameters: [{ name: "layout", in: "query", required: true, schema: { type: "string" } }],
      responses: {
        200: { description: "The catalog" },
        400: { description: "Invalid request" },
      },
    }),
    zValidator("query", z.object({ layout: z.string().min(1).max(64) }), validationHook),
    async (c) => {
      const db = createDb(c.env.DB);
      const { layout } = c.req.valid("query");
      const [known] = await db
        .select({ id: codeModLayouts.id })
        .from(codeModLayouts)
        .where(eq(codeModLayouts.id, layout));
      // A package without a library (layout null) serves every known layout.
      const rows = known
        ? await db
            .select({
              releaseId: codeModReleases.id,
              id: codeMods.slug,
              version: codeModReleases.version,
              layoutId: codeModBuilds.layoutId,
              manifest: codeModBuilds.manifest,
              sha256: codeModBuilds.packageSha256,
              size: codeModBuilds.packageSize,
              signature: codeModBuilds.signature,
              netplay: codeModBuilds.netplay,
            })
            .from(codeModBuilds)
            .innerJoin(codeModReleases, eq(codeModReleases.id, codeModBuilds.releaseId))
            .innerJoin(codeMods, eq(codeMods.id, codeModReleases.codeModId))
            .where(
              and(
                or(eq(codeModBuilds.layoutId, layout), isNull(codeModBuilds.layoutId)),
                eq(codeModBuilds.status, "succeeded"),
                eq(codeModReleases.status, "approved"),
                isNull(codeMods.deletedAt)
              )
            )
        : [];

      const usable = rows.flatMap((row) =>
        row.manifest && row.sha256 && row.size !== null && row.netplay
          ? [
              {
                ...row,
                manifest: row.manifest,
                sha256: row.sha256,
                size: row.size,
                netplay: row.netplay,
              },
            ]
          : []
      );
      // One package per release; a release has a build for its layout or one
      // for every layout, never both, but the layout's own wins regardless.
      const builds = new Map<string, (typeof usable)[number]>();
      for (const row of usable) {
        const seen = builds.get(row.releaseId);
        if (!seen || (seen.layoutId === null && row.layoutId !== null)) {
          builds.set(row.releaseId, row);
        }
      }
      const entries = [...builds.values()].sort(
        (a, b) => a.id.localeCompare(b.id) || byVersionDescending(a.version, b.version)
      );

      const origin = new URL(c.req.url).origin;
      const mods = entries.map((row) => ({
        ...row.manifest,
        netplay: row.netplay,
        package: {
          url: packageUrl(origin, row.sha256),
          sha256: row.sha256,
          size: row.size,
          ...(row.signature ? { signature: row.signature } : {}),
        },
      }));
      // The packages' hashes identify everything an entry says, so the
      // snapshot is a hash of which packages are listed, by layout.
      const snapshot = (
        await sha256Hex(
          [
            `layout ${layout}`,
            ...entries.map((row) => `${row.id} ${row.version} ${row.sha256}`),
          ].join("\n")
        )
      ).slice(0, 32);
      c.header("Cache-Control", LISTING_CACHE);
      return c.json({ schema: CATALOG_SCHEMA, snapshot, mods }, 200);
    }
  )

  // Download a package of an approved release by its SHA-256
  .get(
    "/packages/:file",
    describeRoute({
      tags: ["Registry"],
      summary: "Download a mod package",
      description:
        "A package the catalog lists, by `<sha256>.zip`. The bytes behind a hash never change.",
      responses: {
        200: { description: "The package zip" },
        400: { description: "Invalid request" },
        404: { description: "No approved package has that hash" },
      },
    }),
    zValidator(
      "param",
      z.object({ file: z.string().regex(/^[0-9a-f]{64}\.zip$/, "Not a package file name") }),
      validationHook
    ),
    async (c) => {
      const db = createDb(c.env.DB);
      const sha256 = c.req.valid("param").file.slice(0, 64);
      const [build] = await db
        .select({ packageKey: codeModBuilds.packageKey })
        .from(codeModBuilds)
        .innerJoin(codeModReleases, eq(codeModReleases.id, codeModBuilds.releaseId))
        .innerJoin(codeMods, eq(codeMods.id, codeModReleases.codeModId))
        .where(
          and(
            eq(codeModBuilds.packageSha256, sha256),
            eq(codeModBuilds.status, "succeeded"),
            eq(codeModReleases.status, "approved"),
            isNull(codeMods.deletedAt)
          )
        )
        .limit(1);
      if (!build?.packageKey) return c.json({ error: "Package not found" }, 404);
      const object = await c.env.CODE_MODS.get(build.packageKey);
      if (!object) return c.json({ error: "Package not found" }, 404);
      return new Response(object.body, {
        headers: {
          "Content-Type": "application/zip",
          "Content-Length": String(object.size),
          "Content-Disposition": `attachment; filename="${sha256}.zip"`,
          ETag: `"${sha256}"`,
          // Content-addressed: the bytes behind a hash never change.
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }
  );

export default app;
