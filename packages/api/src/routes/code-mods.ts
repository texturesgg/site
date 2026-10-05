import { zValidator } from "@hono/zod-validator";
import { codeModBuilds, codeModReleases, codeMods, createDb, users } from "@vgskins/db";
import { logger } from "@vgskins/logger";
import { codeModSlugSchema, createCodeModSchema, generateId } from "@vgskins/shared";
import { and, count, desc, eq, getTableColumns, inArray, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { optionalAuth, requireAuth } from "../lib/auth";
import { requireCodeMods } from "../lib/feature-flags";
import { rateLimitByUser } from "../lib/rate-limit";
import {
  canViewUnapprovedReleases,
  loadCodeMod,
  loadCodeModBuild,
  releaseNetplay,
  visibleCodeMods,
} from "../lib/queries";
import {
  PaginationQuery,
  paginationResponse,
  parsePagination,
  validationHook,
} from "../lib/validation";
import type { HonoEnv } from "../types";

// A push token lasts an hour: long enough for a push and its tags. It is
// minted per push and never stored, so its lifetime is the revocation window.
const PUSH_TOKEN_SECONDS = 60 * 60;
// The catalog format tgg-mod reads (its `catalog::SCHEMA`).
const CATALOG_SCHEMA = 1;

const SlugParam = z.object({ slug: codeModSlugSchema });

/** The Artifacts repo holding a code mod's source. */
function repoName(codeModId: string): string {
  return `mod-${codeModId}`;
}

/** The game files a build's package ships, from its packed manifest. */
function shippedFiles(manifest: Record<string, unknown> | null): { path: string; size: number }[] {
  const files = manifest?.files;
  if (!Array.isArray(files)) return [];
  return files.flatMap((file) =>
    typeof file?.path === "string" && typeof file?.size === "number"
      ? [{ path: file.path, size: file.size }]
      : []
  );
}

// Code mods: mods for tgg-melee. Creating one makes its Artifacts repo
// (mod-<id>), its owner pushes tags to it with a short-lived token from here,
// and packages/mod-build builds each tag. Moderators review releases in
// routes/admin.ts. Everything here sits behind the codeMods flag.
const app = new Hono<HonoEnv>()
  .use("*", optionalAuth, requireCodeMods)

  // List code mods the viewer may see, optionally one game's or one creator's
  .get(
    "/",
    zValidator(
      "query",
      PaginationQuery.extend({
        game: z.string().max(64).optional(),
        owner: z.string().max(64).optional(),
      }),
      validationHook
    ),
    async (c) => {
      const db = createDb(c.env.DB);
      const user = c.get("user");
      const query = c.req.valid("query");
      const pagination = parsePagination(query, { defaultPageSize: 20 });

      const where = and(
        visibleCodeMods(db, user),
        query.game ? eq(codeMods.gameId, query.game) : undefined,
        query.owner ? eq(users.name, query.owner) : undefined
      );
      const [rows, [{ total }]] = await Promise.all([
        db
          .select({
            id: codeMods.id,
            slug: codeMods.slug,
            game: codeMods.gameId,
            name: codeMods.name,
            description: codeMods.description,
            userId: codeMods.userId,
            owner: users.name,
            createdAt: codeMods.createdAt,
          })
          .from(codeMods)
          .innerJoin(users, eq(users.id, codeMods.userId))
          .where(where)
          .orderBy(desc(codeMods.createdAt))
          .limit(pagination.pageSize)
          .offset(pagination.offset),
        db
          .select({ total: count() })
          .from(codeMods)
          .innerJoin(users, eq(users.id, codeMods.userId))
          .where(where),
      ]);

      // Each mod's latest release the viewer may see.
      const releases = rows.length
        ? await db
            .select({
              codeModId: codeModReleases.codeModId,
              version: codeModReleases.version,
              status: codeModReleases.status,
              netplay: releaseNetplay(db),
            })
            .from(codeModReleases)
            .where(
              inArray(
                codeModReleases.codeModId,
                rows.map((row) => row.id)
              )
            )
            .orderBy(desc(codeModReleases.createdAt))
        : [];
      const items = rows.map(({ id, userId, ...row }) => {
        const latest = releases.find(
          (release) =>
            release.codeModId === id &&
            (release.status === "approved" || canViewUnapprovedReleases(userId, user))
        );
        return {
          ...row,
          mine: user?.id === userId,
          latest: latest
            ? { version: latest.version, status: latest.status, netplay: latest.netplay }
            : null,
        };
      });
      return c.json(paginationResponse(items, total, pagination), 200);
    }
  )

  // Create a code mod and its source repo
  .post(
    "/",
    requireAuth,
    rateLimitByUser((env) => env.RATE_LIMIT_UPLOAD),
    zValidator("json", createCodeModSchema, validationHook),
    async (c) => {
      const db = createDb(c.env.DB);
      const user = c.get("user");
      const input = c.req.valid("json");

      const [taken] = await db
        .select({ id: codeMods.id })
        .from(codeMods)
        .where(eq(codeMods.slug, input.slug));
      if (taken) return c.json({ error: `The id ${input.slug} is taken` }, 409);

      const id = generateId();
      const repo = await c.env.MOD_SOURCES.create(repoName(id), {
        description: input.slug,
        setDefaultBranch: "main",
      });
      const now = new Date();
      try {
        await db.insert(codeMods).values({
          id,
          userId: user.id,
          gameId: "melee",
          slug: input.slug,
          name: input.name,
          description: input.description ?? null,
          sourceKind: "push",
          createdAt: now,
          updatedAt: now,
        });
      } catch (error) {
        // Another create took the id first; the unique index let one win.
        await c.env.MOD_SOURCES.delete(repoName(id)).catch(() => false);
        logger.warn({ slug: input.slug, error }, "Code mod create lost a race for its id");
        return c.json({ error: `The id ${input.slug} is taken` }, 409);
      }

      logger.info({ userId: user.id, codeModId: id, slug: input.slug }, "Code mod created");
      return c.json({ slug: input.slug, remote: repo.remote }, 201);
    }
  )

  // Get a code mod, with the releases and builds the viewer may see
  .get("/:slug", zValidator("param", SlugParam, validationHook), async (c) => {
    const db = createDb(c.env.DB);
    const user = c.get("user");
    const mod = await loadCodeMod(db, c.req.valid("param").slug, { requester: user });
    if (!mod) return c.json({ error: "Code mod not found" }, 404);

    const seeAll = canViewUnapprovedReleases(mod.userId, user);
    const releases = await db
      .select({ ...getTableColumns(codeModReleases), netplay: releaseNetplay(db) })
      .from(codeModReleases)
      .where(
        and(
          eq(codeModReleases.codeModId, mod.id),
          seeAll ? undefined : eq(codeModReleases.status, "approved")
        )
      )
      .orderBy(desc(codeModReleases.createdAt));
    const [builds, [owner]] = await Promise.all([
      releases.length
        ? db
            .select()
            .from(codeModBuilds)
            .where(
              inArray(
                codeModBuilds.releaseId,
                releases.map((release) => release.id)
              )
            )
        : Promise.resolve([]),
      db.select({ name: users.name }).from(users).where(eq(users.id, mod.userId)),
    ]);

    return c.json(
      {
        slug: mod.slug,
        game: mod.gameId,
        name: mod.name,
        description: mod.description,
        owner: owner?.name ?? null,
        mine: user?.id === mod.userId,
        createdAt: mod.createdAt,
        releases: releases.map((release) => {
          const releaseBuilds = builds.filter((build) => build.releaseId === release.id);
          return {
            id: release.id,
            version: release.version,
            tag: release.tag,
            commit: release.commitSha,
            netplay: release.netplay,
            license: release.license,
            status: release.status,
            error: release.error,
            createdAt: release.createdAt,
            publishedAt: release.publishedAt,
            builds: releaseBuilds.map((build) => ({
              id: build.id,
              layout: build.layoutId,
              status: build.status,
              error: build.error,
              sha256: build.packageSha256,
              size: build.packageSize,
              hooks: build.canonicalHooks,
              state: (build.manifest as { state?: number } | null)?.state ?? null,
              files: shippedFiles(build.manifest),
              hasLog: build.logKey !== null,
              finishedAt: build.finishedAt,
            })),
          };
        }),
      },
      200
    );
  })

  // Mint a write token for the owner to push to the mod's source repo
  .post(
    "/:slug/push-token",
    requireAuth,
    zValidator("param", SlugParam, validationHook),
    async (c) => {
      const db = createDb(c.env.DB);
      const user = c.get("user");
      const mod = await loadCodeMod(db, c.req.valid("param").slug, { requester: user });
      if (!mod) return c.json({ error: "Code mod not found" }, 404);
      if (mod.userId !== user.id) {
        return c.json({ error: "Only the mod's creator can publish to it" }, 403);
      }

      using repo = await c.env.MOD_SOURCES.get(repoName(mod.id));
      const [token, info] = await Promise.all([
        repo.createToken("write", PUSH_TOKEN_SECONDS),
        repo.info(),
      ]);
      logger.info({ userId: user.id, codeModId: mod.id }, "Code mod push token minted");
      c.header("Cache-Control", "no-store");
      return c.json(
        { remote: info.remote, token: token.plaintext, expiresAt: token.expiresAt },
        200
      );
    }
  )

  // Get a build's compiler log
  .get(
    "/builds/:id/log",
    zValidator("param", z.object({ id: z.string().min(1).max(64) }), validationHook),
    async (c) => {
      const db = createDb(c.env.DB);
      const found = await loadCodeModBuild(
        db,
        { id: c.req.valid("param").id },
        { requester: c.get("user") }
      );
      if (!found?.build.logKey) return c.json({ error: "Build log not found" }, 404);
      const log = await c.env.CODE_MODS.get(found.build.logKey);
      if (!log) return c.json({ error: "Build log not found" }, 404);
      return new Response(log.body, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "private, no-store",
        },
      });
    }
  )

  // Download a package by its SHA-256
  .get(
    "/packages/:file",
    zValidator(
      "param",
      z.object({ file: z.string().regex(/^[0-9a-f]{64}\.zip$/, "Not a package file name") }),
      validationHook
    ),
    async (c) => {
      const db = createDb(c.env.DB);
      const sha256 = c.req.valid("param").file.slice(0, 64);
      const found = await loadCodeModBuild(
        db,
        { packageSha256: sha256 },
        { requester: c.get("user") }
      );
      if (!found?.build.packageKey || found.build.status !== "succeeded") {
        return c.json({ error: "Package not found" }, 404);
      }
      const object = await c.env.CODE_MODS.get(found.build.packageKey);
      if (!object) return c.json({ error: "Package not found" }, 404);
      return new Response(object.body, {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="${sha256}.zip"`,
          // Content-addressed: the bytes behind a hash never change.
          "Cache-Control":
            found.release.status === "approved"
              ? "public, max-age=31536000, immutable"
              : "private, no-store",
        },
      });
    }
  )

  // Get the catalog for one game layout: each mod's latest approved release
  // with a build for it, in the format tgg-mod reads
  .get(
    "/catalog/:layout",
    zValidator(
      "param",
      z.object({ layout: z.string().regex(/^[0-9a-f]{16}$/, "Not a game layout id") }),
      validationHook
    ),
    async (c) => {
      const db = createDb(c.env.DB);
      const { layout } = c.req.valid("param");
      const rows = await db
        .select({
          codeModId: codeModReleases.codeModId,
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
            eq(codeModBuilds.layoutId, layout),
            eq(codeModBuilds.status, "succeeded"),
            eq(codeModReleases.status, "approved"),
            isNull(codeMods.deletedAt)
          )
        )
        .orderBy(desc(codeModReleases.createdAt));

      const origin = new URL(c.req.url).origin;
      const seen = new Set<string>();
      const mods = rows.flatMap((row): Record<string, unknown>[] => {
        if (seen.has(row.codeModId) || !row.manifest || !row.sha256 || row.size === null) {
          return [];
        }
        seen.add(row.codeModId);
        return [
          {
            ...row.manifest,
            package: {
              url: `${origin}/api/code-mods/packages/${row.sha256}.zip`,
              sha256: row.sha256,
              size: row.size,
              ...(row.signature ? { signature: row.signature } : {}),
            },
            netplay: row.netplay,
          },
        ];
      });
      mods.sort((a, b) => String(a["id"]).localeCompare(String(b["id"])));
      c.header("Cache-Control", "private, max-age=60");
      return c.json({ schema: CATALOG_SCHEMA, mods }, 200);
    }
  );

export default app;
