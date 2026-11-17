import { zValidator } from "@hono/zod-validator";
import {
  codeModBuilds,
  codeModLayouts,
  codeModReleaseDependencies,
  codeModReleaseImages,
  codeModReleases,
  codeModSetMods,
  codeModSets,
  codeMods,
  createDb,
  users,
} from "@vgskins/db";
import { logger } from "@vgskins/logger";
import {
  buildSlippiMapping,
  byVersionDescending,
  CODE_MOD_WITHDRAW_MODES,
  type CodeModWithdrawMode,
  codeModSlugSchema,
} from "@vgskins/shared";
import { and, asc, count, desc, eq, isNull, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { z } from "zod";
import { layoutSummary, StableManifest, stableLoadsOn } from "../lib/code-mod-layouts";
import {
  PaginationQuery,
  paginationResponse,
  parsePagination,
  validationHook,
} from "../lib/validation";
import { currentPort, imageUrl, listedMods, MOD_COLUMNS, summarize } from "../lib/registry-listing";
import type { HonoEnv } from "../types";

// The catalog format tgg-mod reads (its `catalog::SCHEMA`).
const CATALOG_SCHEMA = 1;
// The Slippi mapping's format (core docs/mod-profiles.md).
const SLIPPI_FORMAT = 1;
// Sets and the catalog change when an admin edits a set or a release is
// approved or built; a minute's staleness is fine for both.
const LISTING_CACHE = "public, max-age=60";

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The URL a package is served at: by its SHA-256, so it never changes. */
function packageUrl(origin: string, sha256: string): string {
  return `${origin}/api/registry/packages/${sha256}.zip`;
}

// A package of a withdrawn release as read back from the database: a
// withdrawn release always has its reason and mode, and a succeeded build
// its hash.
const WithdrawnPackageRow = z.object({
  releaseId: z.string(),
  id: codeModSlugSchema,
  version: z.string(),
  reason: z.string(),
  mode: z.enum(CODE_MOD_WITHDRAW_MODES),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});

/**
 * The catalog's `withdrawn` list: one entry per withdrawn release with every
 * package hash it had, sorted by id and version. A row that doesn't parse
 * (which the writers never leave) is logged and left out.
 */
function withdrawnList(rows: unknown[]): {
  id: string;
  version: string;
  reason: string;
  mode: CodeModWithdrawMode;
  sha256: string[];
}[] {
  const releases = new Map<
    string,
    { id: string; version: string; reason: string; mode: CodeModWithdrawMode; sha256: string[] }
  >();
  for (const raw of rows) {
    const parsed = WithdrawnPackageRow.safeParse(raw);
    if (!parsed.success) {
      logger.warn({ error: parsed.error.message }, "A withdrawn package row didn't read");
      continue;
    }
    const { releaseId, sha256, ...entry } = parsed.data;
    const release = releases.get(releaseId) ?? { ...entry, sha256: [] };
    release.sha256.push(sha256);
    releases.set(releaseId, release);
  }
  return [...releases.values()]
    .map((release) => ({ ...release, sha256: release.sha256.sort() }))
    .sort((a, b) => a.id.localeCompare(b.id) || byVersionDescending(a.version, b.version));
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

  // Every game layout mods are built for: its system and the port release it came from
  .get(
    "/layouts",
    describeRoute({
      tags: ["Registry"],
      summary: "List game layouts",
      description:
        "Every game layout the registry knows, newest port release first: `{id, target, system, portVersion, active}`. `target` is the target triple, `system` is `linux`, `windows`, `macos` or `other`, `portVersion` is the tgg-melee release the layout came from, and `active` is whether new releases are built for it (a retired layout keeps its packages).",
      responses: { 200: { description: "Every layout" } },
    }),
    async (c) => {
      const db = createDb(c.env.DB);
      const layouts = await db
        .select({
          id: codeModLayouts.id,
          target: codeModLayouts.target,
          portVersion: codeModLayouts.portVersion,
          active: codeModLayouts.active,
        })
        .from(codeModLayouts);
      layouts.sort(
        (a, b) =>
          byVersionDescending(a.portVersion, b.portVersion) || a.target.localeCompare(b.target)
      );
      c.header("Cache-Control", LISTING_CACHE);
      return c.json(layouts.map(layoutSummary), 200);
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
        "tgg-mod's catalog (schema 1) for `layout`, a port's game layout id: every approved release with a successful build for it, newest first per mod. A package without a library serves every layout, and a stable-tier library built for another layout serves this one when its target matches and this port's API loads it (same major; from 1.0 an older or equal minor unless it uses experimental calls; before 1.0 the same minor). Each entry is the packed manifest with `netplay`, `publisher: {id, name, official}` (as the mods list gives it) and `package: {url, sha256, size}`; package URLs are content-addressed and immutable. `ids` is every mod id with an approved release, built for this layout or not. `withdrawn` lists releases a moderator pulled after approval, for every layout: `{id, version, reason, mode, sha256: [...]}`, where `mode` is `off` (tgg turns an installed copy off) or `warn` (tgg says why and leaves it on). `snapshot` names this state of the catalog. An unknown layout has no mods.",
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
        .select({
          id: codeModLayouts.id,
          target: codeModLayouts.target,
          apiVersion: codeModLayouts.apiVersion,
        })
        .from(codeModLayouts)
        .where(eq(codeModLayouts.id, layout));
      // A package without a library (layout null) serves every known layout.
      // A stable-tier library built for another layout serves this one too
      // when it has the same target and this port's API loads it.
      const offers = known?.apiVersion ?? null;
      const builtFor = known
        ? offers
          ? or(
              eq(codeModBuilds.layoutId, layout),
              isNull(codeModBuilds.layoutId),
              eq(codeModLayouts.target, known.target)
            )
          : or(eq(codeModBuilds.layoutId, layout), isNull(codeModBuilds.layoutId))
        : undefined;
      const found = known
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
              author: users.name,
              userId: codeMods.userId,
              publisherName: codeMods.publisherName,
              official: codeMods.official,
            })
            .from(codeModBuilds)
            .innerJoin(codeModReleases, eq(codeModReleases.id, codeModBuilds.releaseId))
            .innerJoin(codeMods, eq(codeMods.id, codeModReleases.codeModId))
            .innerJoin(users, eq(users.id, codeMods.userId))
            .leftJoin(codeModLayouts, eq(codeModLayouts.id, codeModBuilds.layoutId))
            .where(
              and(
                builtFor,
                eq(codeModBuilds.status, "succeeded"),
                eq(codeModReleases.status, "approved"),
                isNull(codeMods.deletedAt)
              )
            )
        : [];
      // Rank each package for this layout: its own build, then one for every
      // layout, then a stable one borrowed from another layout (the newest
      // API first). A package from another layout that isn't stable, or that
      // this port's API doesn't load, isn't served.
      const rows = found.flatMap((row) => {
        if (row.layoutId === layout) return [{ ...row, rank: 0, borrowedApi: 0 }];
        if (row.layoutId === null) return [{ ...row, rank: 1, borrowedApi: 0 }];
        const stable = StableManifest.safeParse(row.manifest);
        if (!offers || !stable.success || stable.data.target !== known?.target) return [];
        if (!stableLoadsOn(stable.data, offers)) return [];
        return [{ ...row, rank: 2, borrowedApi: stable.data.api_version.minor }];
      });

      // Every mod the registry has, built for this layout or not, so a client
      // can tell a mod that doesn't exist from one not built for its game yet.
      const ids = (
        await db
          .selectDistinct({ slug: codeMods.slug })
          .from(codeMods)
          .innerJoin(codeModReleases, eq(codeModReleases.codeModId, codeMods.id))
          .where(and(eq(codeModReleases.status, "approved"), isNull(codeMods.deletedAt)))
      )
        .map((mod) => mod.slug)
        .sort();

      // Every package of a withdrawn release, for every layout (a player's
      // installed copy may be from an older port), so tgg can act on copies
      // it installed before the withdrawal.
      const withdrawnRows = await db
        .select({
          releaseId: codeModReleases.id,
          id: codeMods.slug,
          version: codeModReleases.version,
          reason: codeModReleases.withdrawReason,
          mode: codeModReleases.withdrawMode,
          sha256: codeModBuilds.packageSha256,
        })
        .from(codeModBuilds)
        .innerJoin(codeModReleases, eq(codeModReleases.id, codeModBuilds.releaseId))
        .innerJoin(codeMods, eq(codeMods.id, codeModReleases.codeModId))
        .where(
          and(
            eq(codeModBuilds.status, "succeeded"),
            eq(codeModReleases.status, "withdrawn"),
            isNull(codeMods.deletedAt)
          )
        );
      const withdrawn = withdrawnList(withdrawnRows);

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
      // One package per release, the best ranked (ties go to the lower
      // SHA-256, so the choice doesn't depend on row order).
      const builds = new Map<string, (typeof usable)[number]>();
      const better = (a: (typeof usable)[number], b: (typeof usable)[number]) =>
        a.rank - b.rank || b.borrowedApi - a.borrowedApi || a.sha256.localeCompare(b.sha256);
      for (const row of usable) {
        const seen = builds.get(row.releaseId);
        if (!seen || better(row, seen) < 0) builds.set(row.releaseId, row);
      }
      const entries = [...builds.values()].sort(
        (a, b) => a.id.localeCompare(b.id) || byVersionDescending(a.version, b.version)
      );

      const origin = new URL(c.req.url).origin;
      const mods = entries.map((row) => ({
        ...row.manifest,
        netplay: row.netplay,
        publisher: {
          id: row.userId,
          name: row.publisherName ?? row.author,
          official: row.official,
        },
        package: {
          url: packageUrl(origin, row.sha256),
          sha256: row.sha256,
          size: row.size,
          ...(row.signature ? { signature: row.signature } : {}),
        },
      }));
      // The snapshot is a hash of which packages are listed, by layout, who
      // publishes each, and which mods the registry has.
      const snapshot = (
        await sha256Hex(
          [
            `layout ${layout}`,
            ...entries.map(
              (row) =>
                `${row.id} ${row.version} ${row.sha256} ${row.userId} ${row.publisherName ?? row.author} ${row.official}`
            ),
            `ids ${ids.join(" ")}`,
            ...withdrawn.map(
              (entry) =>
                `withdrawn ${entry.id} ${entry.version} ${entry.mode} ${entry.sha256.join(",")} ${entry.reason}`
            ),
          ].join("\n")
        )
      ).slice(0, 32);
      c.header("Cache-Control", LISTING_CACHE);
      return c.json({ schema: CATALOG_SCHEMA, snapshot, mods, ids, withdrawn }, 200);
    }
  )

  // The Slippi mapping: which mods reproduce the gecko codes a Slippi replay ran
  .get(
    "/slippi",
    describeRoute({
      tags: ["Registry"],
      summary: "Get the Slippi mapping",
      description:
        "Which mods reproduce the gecko codes a Slippi replay's console ran (core docs/mod-profiles.md): `{format: 1, snapshot, codes, minor, ignore}`. `codes` are `{code, name, versions, stages?, unless?, id?, range?, game?}`: a code (`0x` and eight upper-case hex digits, or a Game Start fact, `frozen-stadium` or `ucf-off`), the Slippi versions the entry holds for (a semver requirement such as `*` or `<3.19`), the Game Start stage ids it matters on, codes whose presence keeps it from holding, and the mod (`id`) and range of its releases that reproduce it, or `game`, the built-in module states it implies (an entry with neither is a gameplay code nothing reproduces yet). For each code, the first `codes` entry that holds wins: what the game does itself comes first, then what each mod's newest approved release declares in its manifest's `slippi` field. `minor` (gameplay codes nothing reproduces yet that rarely change a replay) and `ignore` (codes that don't change gameplay) are `{code, name, versions, stages?}`. `snapshot` names this state of the mapping.",
      responses: { 200: { description: "The mapping" } },
    }),
    async (c) => {
      const db = createDb(c.env.DB);
      const rows = await db
        .select({
          id: codeMods.slug,
          official: codeMods.official,
          version: codeModReleases.version,
          slippi: codeModReleases.slippi,
        })
        .from(codeModReleases)
        .innerJoin(codeMods, eq(codeMods.id, codeModReleases.codeModId))
        .where(and(eq(codeModReleases.status, "approved"), isNull(codeMods.deletedAt)));
      const mods = new Map<
        string,
        {
          id: string;
          official: boolean;
          releases: { version: string; slippi: (typeof rows)[number]["slippi"] }[];
        }
      >();
      for (const row of rows) {
        const mod = mods.get(row.id) ?? { id: row.id, official: row.official, releases: [] };
        mod.releases.push({ version: row.version, slippi: row.slippi });
        mods.set(row.id, mod);
      }
      const { codes, minor, ignore } = buildSlippiMapping([...mods.values()], byVersionDescending);
      const snapshot = (await sha256Hex(JSON.stringify({ codes, minor, ignore }))).slice(0, 32);
      c.header("Cache-Control", LISTING_CACHE);
      return c.json({ format: SLIPPI_FORMAT, snapshot, codes, minor, ignore }, 200);
    }
  )

  // The mods a store lists: each mod with an approved release, most installed first
  .get(
    "/mods",
    describeRoute({
      tags: ["Registry"],
      summary: "List mods",
      description:
        "Every mod with an approved release, paginated (`page`, `pageSize` up to 100, default 50), in `sort` order: `official` (the default) lists official mods first, then most installed; `installs` is most installed alone. Each is described by its newest approved release: `{id, name, description, author, publisher: {id, name, official}, icon: {url, width, height} | null, tags, installs, version, updatedAt, sets, targets, netplay, kind}`. `publisher.name` is the name an admin set for the mod (first-party mods say textures.gg) or else the author's account name; `official` marks mods admins vouch for; `id` is the publishing account's id, which never changes. `author` is the author's account name. `targets` are the systems (`linux`, `windows`, `macos`) that release has builds for on `port`, the newest tgg-melee release with active layouts. `kind` is `script`, `native` or `content` (null for a release checked before kinds were recorded). `installs` counts first installs: package downloads with `for=install`.",
      responses: {
        200: { description: "A page of mods" },
        400: { description: "Invalid request" },
      },
    }),
    zValidator(
      "query",
      PaginationQuery.extend({ sort: z.enum(["official", "installs"]).default("official") }),
      validationHook
    ),
    async (c) => {
      const db = createDb(c.env.DB);
      const query = c.req.valid("query");
      const pagination = parsePagination(query, { defaultPageSize: 50 });
      const order =
        query.sort === "official"
          ? [desc(codeMods.official), desc(codeMods.downloadCount), asc(codeMods.slug)]
          : [desc(codeMods.downloadCount), asc(codeMods.slug)];
      const where = listedMods(db);
      const [rows, [{ total }], port] = await Promise.all([
        db
          .select(MOD_COLUMNS)
          .from(codeMods)
          .innerJoin(users, eq(users.id, codeMods.userId))
          .where(where)
          .orderBy(...order)
          .limit(pagination.pageSize)
          .offset(pagination.offset),
        db.select({ total: count() }).from(codeMods).where(where),
        currentPort(db),
      ]);
      const origin = new URL(c.req.url).origin;
      const items = (await summarize(db, origin, rows, port)).map(
        ({ releaseId: _, iconSha256: __, ...summary }) => summary
      );
      c.header("Cache-Control", LISTING_CACHE);
      return c.json({ port: port.version, ...paginationResponse(items, total, pagination) }, 200);
    }
  )

  // One mod's store page: its summary, README, screenshots, links, releases and dependencies
  .get(
    "/mods/:id",
    describeRoute({
      tags: ["Registry"],
      summary: "Get a mod's details",
      description:
        "A listed mod's summary (as in the list) with `port`, plus its newest approved release's `readme` (markdown from the source's README, or null), `screenshots`, `homepage`, `license` and `depends: [{id, range}]`; `source`, its source repository when public; and `releases`: every approved release, newest first, `{version, date, changelog}`, the changelog being that version's CHANGELOG.md section or null.",
      responses: { 200: { description: "The mod" }, 404: { description: "No such listed mod" } },
    }),
    zValidator("param", z.object({ id: codeModSlugSchema }), validationHook),
    async (c) => {
      const db = createDb(c.env.DB);
      const [[mod], port] = await Promise.all([
        db
          .select(MOD_COLUMNS)
          .from(codeMods)
          .innerJoin(users, eq(users.id, codeMods.userId))
          .where(and(eq(codeMods.slug, c.req.valid("param").id), listedMods(db))),
        currentPort(db),
      ]);
      if (!mod) return c.json({ error: "Mod not found" }, 404);
      const origin = new URL(c.req.url).origin;
      const [{ releaseId, iconSha256: _, ...summary }] = await summarize(db, origin, [mod], port);
      const [releases, screenshots, depends] = await Promise.all([
        db
          .select({
            id: codeModReleases.id,
            version: codeModReleases.version,
            readme: codeModReleases.readme,
            changelog: codeModReleases.changelog,
            homepage: codeModReleases.homepage,
            license: codeModReleases.license,
            createdAt: codeModReleases.createdAt,
            publishedAt: codeModReleases.publishedAt,
          })
          .from(codeModReleases)
          .where(
            and(eq(codeModReleases.codeModId, mod.id), eq(codeModReleases.status, "approved"))
          ),
        db
          .select()
          .from(codeModReleaseImages)
          .where(
            and(
              eq(codeModReleaseImages.releaseId, releaseId),
              eq(codeModReleaseImages.kind, "screenshot")
            )
          )
          .orderBy(asc(codeModReleaseImages.position)),
        db
          .select({
            id: codeModReleaseDependencies.dependency,
            range: codeModReleaseDependencies.range,
          })
          .from(codeModReleaseDependencies)
          .where(eq(codeModReleaseDependencies.releaseId, releaseId))
          .orderBy(asc(codeModReleaseDependencies.dependency)),
      ]);
      releases.sort((a, b) => byVersionDescending(a.version, b.version));
      const latest = releases.find((release) => release.id === releaseId);
      c.header("Cache-Control", LISTING_CACHE);
      return c.json(
        {
          ...summary,
          port: port.version,
          readme: latest?.readme ?? null,
          screenshots: screenshots.map((image) => ({
            url: imageUrl(origin, image.sha256),
            width: image.width,
            height: image.height,
          })),
          homepage: latest?.homepage ?? null,
          source: mod.sourceUrl,
          license: latest?.license ?? null,
          releases: releases.map((release) => ({
            version: release.version,
            date: release.publishedAt ?? release.createdAt,
            changelog: release.changelog,
          })),
          depends,
        },
        200
      );
    }
  )

  // A listing's image by its SHA-256
  .get(
    "/images/:file",
    describeRoute({
      tags: ["Registry"],
      summary: "Get a mod's icon or screenshot",
      description:
        "An image a listed release names, by `<sha256>.png`. The bytes behind a hash never change.",
      responses: {
        200: { description: "The PNG" },
        400: { description: "Invalid request" },
        404: { description: "No approved release has that image" },
      },
    }),
    zValidator(
      "param",
      z.object({ file: z.string().regex(/^[0-9a-f]{64}\.png$/, "Not an image file name") }),
      validationHook
    ),
    async (c) => {
      const db = createDb(c.env.DB);
      const sha256 = c.req.valid("param").file.slice(0, 64);
      const [image] = await db
        .select({ sha256: codeModReleaseImages.sha256 })
        .from(codeModReleaseImages)
        .innerJoin(codeModReleases, eq(codeModReleases.id, codeModReleaseImages.releaseId))
        .innerJoin(codeMods, eq(codeMods.id, codeModReleases.codeModId))
        .where(
          and(
            eq(codeModReleaseImages.sha256, sha256),
            eq(codeModReleases.status, "approved"),
            isNull(codeMods.deletedAt)
          )
        )
        .limit(1);
      if (!image) return c.json({ error: "Image not found" }, 404);
      const object = await c.env.CODE_MODS.get(`code-mods/images/${sha256}.png`);
      if (!object) return c.json({ error: "Image not found" }, 404);
      return new Response(object.body, {
        headers: {
          "Content-Type": "image/png",
          "Content-Length": String(object.size),
          ETag: `"${sha256}"`,
          "Cache-Control": "public, max-age=31536000, immutable",
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "default-src 'none'; sandbox",
        },
      });
    }
  )

  // Download a package of an approved release by its SHA-256
  .get(
    "/packages/:file",
    describeRoute({
      tags: ["Registry"],
      summary: "Download a mod package",
      description:
        "A package the catalog lists, by `<sha256>.zip`. The bytes behind a hash never change. `for=install` says the player is installing the mod for the first time, which counts toward its installs; any other download (an update, a reinstall, no `for`) isn't counted.",
      parameters: [{ name: "for", in: "query", required: false, schema: { type: "string" } }],
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
    // Any `for` is served: it only decides whether the download is counted.
    zValidator("query", z.object({ for: z.string().max(32).optional() }), validationHook),
    async (c) => {
      const db = createDb(c.env.DB);
      const sha256 = c.req.valid("param").file.slice(0, 64);
      const firstInstall = c.req.valid("query").for === "install";
      const [build] = await db
        .select({ packageKey: codeModBuilds.packageKey, codeModId: codeMods.id })
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
      // The mod's install count: first installs only, counted after the
      // response so it never slows one.
      if (firstInstall) {
        c.executionCtx.waitUntil(
          db
            .update(codeMods)
            .set({ downloadCount: sql`${codeMods.downloadCount} + 1` })
            .where(eq(codeMods.id, build.codeModId))
            .then(
              () => undefined,
              (error: unknown) => logger.warn({ error, sha256 }, "Counting an install failed")
            )
        );
      }
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
