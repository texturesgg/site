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
  type Database,
} from "@vgskins/db";
import { logger } from "@vgskins/logger";
import { buildSlippiMapping, byVersionDescending, codeModSlugSchema } from "@vgskins/shared";
import { and, asc, count, desc, eq, exists, inArray, isNull, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { z } from "zod";
import {
  CODE_MOD_SYSTEMS,
  type CodeModSystem,
  layoutSummary,
  layoutSystem,
} from "../lib/code-mod-layouts";
import {
  PaginationQuery,
  paginationResponse,
  parsePagination,
  validationHook,
} from "../lib/validation";
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

/** The URL a listing's image is served at, by its SHA-256. */
function imageUrl(origin: string, sha256: string): string {
  return `${origin}/api/registry/images/${sha256}.png`;
}

type Image = { url: string; width: number; height: number };
type Netplay = NonNullable<(typeof codeModBuilds.$inferSelect)["netplay"]>;

/** What the mods list shows of a mod; the details add to it. */
type ModSummary = {
  id: string;
  name: string;
  description: string | null;
  // The author's account name, kept for older installers; stores show
  // `publisher`.
  author: string;
  // Who publishes it: an admin-set name (first-party mods say "textures.gg")
  // or the author's name, and whether admins vouch for it.
  publisher: { name: string; official: boolean };
  icon: Image | null;
  tags: string[];
  installs: number;
  version: string;
  updatedAt: Date;
  sets: string[];
  targets: CodeModSystem[];
  netplay: Netplay | null;
};

// A listed mod: not deleted, with an approved release.
function listedMods(db: Database) {
  return and(
    isNull(codeMods.deletedAt),
    exists(
      db
        .select({ one: sql`1` })
        .from(codeModReleases)
        .where(
          and(eq(codeModReleases.codeModId, codeMods.id), eq(codeModReleases.status, "approved"))
        )
    )
  );
}

const MOD_COLUMNS = {
  id: codeMods.id,
  slug: codeMods.slug,
  name: codeMods.name,
  description: codeMods.description,
  sourceUrl: codeMods.sourceUrl,
  installs: codeMods.downloadCount,
  author: users.name,
  publisherName: codeMods.publisherName,
  official: codeMods.official,
};
type ModRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  installs: number;
  author: string;
  publisherName: string | null;
  official: boolean;
};

/**
 * The newest tgg-melee release the builder has active layouts for, and the
 * systems they cover: what a mod's `targets` are counted against.
 */
async function currentPort(
  db: Database
): Promise<{ version: string | null; layouts: Map<string, CodeModSystem> }> {
  const active = await db
    .select({
      id: codeModLayouts.id,
      target: codeModLayouts.target,
      portVersion: codeModLayouts.portVersion,
    })
    .from(codeModLayouts)
    .where(eq(codeModLayouts.active, true));
  const version = active.map((layout) => layout.portVersion).sort(byVersionDescending)[0] ?? null;
  const layouts = new Map<string, CodeModSystem>();
  for (const layout of active) {
    const os = layoutSystem(layout.target);
    if (layout.portVersion === version && os !== "other") layouts.set(layout.id, os);
  }
  return { version, layouts };
}

/**
 * The summaries of `mods`, each from its newest approved release, with
 * that release's id for the details to read more of.
 */
async function summarize(
  db: Database,
  origin: string,
  mods: ModRow[],
  port: Awaited<ReturnType<typeof currentPort>>
): Promise<(ModSummary & { releaseId: string })[]> {
  if (mods.length === 0) return [];
  const releases = await db
    .select({
      id: codeModReleases.id,
      codeModId: codeModReleases.codeModId,
      version: codeModReleases.version,
      tags: codeModReleases.tags,
      createdAt: codeModReleases.createdAt,
      publishedAt: codeModReleases.publishedAt,
    })
    .from(codeModReleases)
    .where(
      and(
        inArray(
          codeModReleases.codeModId,
          mods.map((mod) => mod.id)
        ),
        eq(codeModReleases.status, "approved")
      )
    );
  const latest = new Map<string, (typeof releases)[number]>();
  for (const release of releases) {
    const seen = latest.get(release.codeModId);
    if (!seen || byVersionDescending(release.version, seen.version) < 0) {
      latest.set(release.codeModId, release);
    }
  }
  const releaseIds = [...latest.values()].map((release) => release.id);
  const [builds, icons, sets] = await Promise.all([
    db
      .select({
        releaseId: codeModBuilds.releaseId,
        layoutId: codeModBuilds.layoutId,
        manifest: codeModBuilds.manifest,
        netplay: codeModBuilds.netplay,
      })
      .from(codeModBuilds)
      .where(
        and(inArray(codeModBuilds.releaseId, releaseIds), eq(codeModBuilds.status, "succeeded"))
      ),
    db
      .select()
      .from(codeModReleaseImages)
      .where(
        and(
          inArray(codeModReleaseImages.releaseId, releaseIds),
          eq(codeModReleaseImages.kind, "icon")
        )
      ),
    db
      .select({ setName: codeModSetMods.setName, mod: codeModSetMods.mod })
      .from(codeModSetMods)
      .where(
        inArray(
          codeModSetMods.mod,
          mods.map((mod) => mod.slug)
        )
      )
      .orderBy(asc(codeModSetMods.setName)),
  ]);

  return mods.flatMap((mod) => {
    const release = latest.get(mod.id);
    if (!release) return [];
    const built = builds.filter((build) => build.releaseId === release.id);
    // A build without a library (layout null) serves every layout.
    const systems = new Set(
      built.flatMap((build) =>
        build.layoutId === null
          ? [...port.layouts.values()]
          : (port.layouts.get(build.layoutId) ?? [])
      )
    );
    const manifest = built.find((build) => build.manifest)?.manifest ?? {};
    const icon = icons.find((image) => image.releaseId === release.id);
    return [
      {
        releaseId: release.id,
        id: mod.slug,
        name: typeof manifest.name === "string" ? manifest.name : mod.name,
        description:
          typeof manifest.description === "string" ? manifest.description : mod.description,
        author: mod.author,
        publisher: { name: mod.publisherName ?? mod.author, official: mod.official },
        icon: icon
          ? { url: imageUrl(origin, icon.sha256), width: icon.width, height: icon.height }
          : null,
        tags: release.tags ?? [],
        installs: mod.installs,
        version: release.version,
        updatedAt: release.publishedAt ?? release.createdAt,
        sets: sets.filter((set) => set.mod === mod.slug).map((set) => set.setName),
        targets: CODE_MOD_SYSTEMS.filter((os) => systems.has(os)),
        netplay: built.find((build) => build.netplay)?.netplay ?? null,
      },
    ];
  });
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
        "tgg-mod's catalog (schema 1) for `layout`, a port's game layout id: every approved release with a successful build for it, newest first per mod. Each entry is the packed manifest with `netplay`, `publisher: {name, official}` (as the mods list gives it) and `package: {url, sha256, size}`; package URLs are content-addressed and immutable. `ids` is every mod id with an approved release, built for this layout or not. `snapshot` names this state of the catalog. An unknown layout has no mods.",
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
              author: users.name,
              publisherName: codeMods.publisherName,
              official: codeMods.official,
            })
            .from(codeModBuilds)
            .innerJoin(codeModReleases, eq(codeModReleases.id, codeModBuilds.releaseId))
            .innerJoin(codeMods, eq(codeMods.id, codeModReleases.codeModId))
            .innerJoin(users, eq(users.id, codeMods.userId))
            .where(
              and(
                or(eq(codeModBuilds.layoutId, layout), isNull(codeModBuilds.layoutId)),
                eq(codeModBuilds.status, "succeeded"),
                eq(codeModReleases.status, "approved"),
                isNull(codeMods.deletedAt)
              )
            )
        : [];

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
        publisher: { name: row.publisherName ?? row.author, official: row.official },
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
                `${row.id} ${row.version} ${row.sha256} ${row.publisherName ?? row.author} ${row.official}`
            ),
            `ids ${ids.join(" ")}`,
          ].join("\n")
        )
      ).slice(0, 32);
      c.header("Cache-Control", LISTING_CACHE);
      return c.json({ schema: CATALOG_SCHEMA, snapshot, mods, ids }, 200);
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
        "Every mod with an approved release, paginated (`page`, `pageSize` up to 100, default 50), in `sort` order: `official` (the default) lists official mods first, then most installed; `installs` is most installed alone. Each is described by its newest approved release: `{id, name, description, author, publisher: {name, official}, icon: {url, width, height} | null, tags, installs, version, updatedAt, sets, targets, netplay}`. `publisher.name` is the name an admin set for the mod (first-party mods say textures.gg) or else the author's account name; `official` marks mods admins vouch for. `author` is the author's account name. `targets` are the systems (`linux`, `windows`, `macos`) that release has builds for on `port`, the newest tgg-melee release with active layouts. `installs` counts package downloads.",
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
        ({ releaseId: _, ...summary }) => summary
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
      const [{ releaseId, ...summary }] = await summarize(db, origin, [mod], port);
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
      // The mod's install count: every download, counted after the response
      // so it never slows one.
      c.executionCtx.waitUntil(
        db
          .update(codeMods)
          .set({ downloadCount: sql`${codeMods.downloadCount} + 1` })
          .where(eq(codeMods.id, build.codeModId))
          .then(
            () => undefined,
            (error: unknown) => logger.warn({ error, sha256 }, "Counting a package download failed")
          )
      );
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
