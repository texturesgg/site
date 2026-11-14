import { zValidator } from "@hono/zod-validator";
import {
  codeModBuilds,
  codeModReleaseDependencies,
  codeModReleaseImages,
  codeModReleases,
  createDb,
} from "@vgskins/db";
import { and, asc, desc, eq, inArray, lt } from "drizzle-orm";
import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { z } from "zod";
import { optionalAuth } from "../lib/auth";
import { diffCommits, diffFile, listFiles, modRepoName, readSourceFile } from "../lib/mod-source";
import { canViewUnapprovedReleases, loadCodeModRelease } from "../lib/queries";
import { validationHook } from "../lib/validation";
import type { HonoEnv } from "../types";

// One code mod release, as review and the source browser read it: its source
// at its commit (from the Artifacts repo `mod-<id>`), what changed since the
// mod's previous approved release, and its listing beside that release's.
// Which releases a requester may read is `loadCodeModRelease`'s rule; the
// diff is for the mod's owner and moderators alone. Moderators approve and
// reject in routes/admin.ts.

type Database = ReturnType<typeof createDb>;
type Release = typeof codeModReleases.$inferSelect;

const ReleaseParam = z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "Invalid release") });
const PathQuery = z.object({
  path: z
    .string()
    .min(1)
    .max(1024)
    .refine(
      (path) => path.split("/").every((part) => part !== "" && part !== "." && part !== ".."),
      "Invalid path"
    ),
});

const notFound = { error: "Release not found" } as const;

/** Approved source never changes under its commit, so browsers may keep it a while. */
function cacheControl(release: Release): string {
  return release.status === "approved" ? "public, max-age=3600" : "private, no-store";
}

function summary(release: Release, mod: string) {
  return {
    id: release.id,
    mod,
    version: release.version,
    commit: release.commitSha,
    status: release.status,
  };
}

/**
 * The mod's approved release before `release`: the newest approved one
 * recorded earlier. A pending release is reviewed against it; the mod's first
 * release has none.
 */
async function previousApproved(db: Database, release: Release) {
  const [previous] = await db
    .select()
    .from(codeModReleases)
    .where(
      and(
        eq(codeModReleases.codeModId, release.codeModId),
        eq(codeModReleases.status, "approved"),
        lt(codeModReleases.createdAt, release.createdAt)
      )
    )
    .orderBy(desc(codeModReleases.createdAt))
    .limit(1);
  return previous;
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

function manifestText(manifest: Record<string, unknown> | null, field: string): string | null {
  const value = manifest?.[field];
  return typeof value === "string" ? value : null;
}

/**
 * Each release's listing: what the store shows from its source and what its
 * first successful build says about how it runs (null before one succeeds).
 */
async function listings(db: Database, origin: string, releases: Release[]) {
  const ids = releases.map((release) => release.id);
  const [dependencies, images, builds] = await Promise.all([
    db
      .select()
      .from(codeModReleaseDependencies)
      .where(inArray(codeModReleaseDependencies.releaseId, ids))
      .orderBy(asc(codeModReleaseDependencies.dependency)),
    db
      .select()
      .from(codeModReleaseImages)
      .where(inArray(codeModReleaseImages.releaseId, ids))
      .orderBy(asc(codeModReleaseImages.position)),
    db
      .select()
      .from(codeModBuilds)
      .where(and(inArray(codeModBuilds.releaseId, ids), eq(codeModBuilds.status, "succeeded")))
      .orderBy(asc(codeModBuilds.createdAt)),
  ]);
  return releases.map((release) => {
    const image = (kind: "icon" | "screenshot") =>
      images
        .filter((item) => item.releaseId === release.id && item.kind === kind)
        .map((item) => ({
          url: `${origin}/api/code-mod-releases/${release.id}/images/${item.sha256}.png`,
          width: item.width,
          height: item.height,
        }));
    const build = builds.find((item) => item.releaseId === release.id);
    const manifest = build?.manifest ?? null;
    const state = (manifest as { state?: unknown } | null)?.state;
    const strings = (key: "uses" | "sim_writes"): string[] => {
      const value = (manifest as Record<string, unknown> | null)?.[key];
      return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
    };
    return {
      id: release.id,
      version: release.version,
      status: release.status,
      commit: release.commitSha,
      createdAt: release.createdAt,
      publishedAt: release.publishedAt,
      name: manifestText(manifest, "name"),
      description: manifestText(manifest, "description"),
      readme: release.readme,
      changelog: release.changelog,
      tags: release.tags ?? [],
      homepage: release.homepage,
      license: release.license,
      icon: image("icon")[0] ?? null,
      screenshots: image("screenshot"),
      depends: dependencies
        .filter((dependency) => dependency.releaseId === release.id)
        .map(({ dependency, range }) => ({ id: dependency, range })),
      netplay: build?.netplay ?? null,
      hooks: build?.canonicalHooks ?? null,
      files: shippedFiles(manifest),
      state: typeof state === "number" ? state : null,
      kind: release.kind,
      // A script's list and what of it changes a match, from its package
      uses: strings("uses"),
      simWrites: strings("sim_writes"),
    };
  });
}

const app = new Hono<HonoEnv>()
  .use("*", optionalAuth)

  // The files at a release's commit
  .get(
    "/:id/tree",
    describeRoute({
      tags: ["Code mod releases"],
      summary: "List a release's source files",
      description:
        "`release: {id, mod, version, commit, status}` and `entries: [{path, kind}]`, every file at the release's commit sorted by path (`kind`: `file`, `symlink` or `submodule`; folders are implied by the paths). `truncated` is true when the repo had more than the 5000 files or 500 folders read. Public for approved releases; the mod's owner and moderators for any.",
      responses: {
        200: { description: "The files" },
        400: { description: "Invalid request" },
        404: { description: "No release the requester may read has that id" },
      },
    }),
    zValidator("param", ReleaseParam, validationHook),
    async (c) => {
      const db = createDb(c.env.DB);
      const found = await loadCodeModRelease(db, c.req.valid("param").id, {
        requester: c.get("user"),
      });
      if (!found) return c.json(notFound, 404);
      using repo = await c.env.MOD_SOURCES.get(modRepoName(found.mod.id));
      const files = await listFiles(repo, found.release.commitSha);
      if (!files) return c.json(notFound, 404);
      c.header("Cache-Control", cacheControl(found.release));
      return c.json({ release: summary(found.release, found.mod.slug), ...files }, 200);
    }
  )

  // One file at a release's commit
  .get(
    "/:id/file",
    describeRoute({
      tags: ["Code mod releases"],
      summary: "Read one of a release's source files",
      description:
        "The file at `path` (as `tree` lists it): `{path, kind, size, binary, content, truncated}`. `content` is the text, cut at 1 MiB with `truncated` true; null for a binary file (a NUL byte or not UTF-8) or a submodule, whose `size` alone is given. Public for approved releases; the mod's owner and moderators for any.",
      responses: {
        200: { description: "The file" },
        400: { description: "Invalid request" },
        404: { description: "No such release or file" },
      },
    }),
    zValidator("param", ReleaseParam, validationHook),
    zValidator("query", PathQuery, validationHook),
    async (c) => {
      const db = createDb(c.env.DB);
      const found = await loadCodeModRelease(db, c.req.valid("param").id, {
        requester: c.get("user"),
      });
      if (!found) return c.json(notFound, 404);
      using repo = await c.env.MOD_SOURCES.get(modRepoName(found.mod.id));
      const file = await readSourceFile(repo, found.release.commitSha, c.req.valid("query").path);
      if (!file) return c.json({ error: "File not found" }, 404);
      c.header("Cache-Control", cacheControl(found.release));
      return c.json(file, 200);
    }
  )

  // What changed in the source since the mod's previous approved release
  .get(
    "/:id/diff",
    describeRoute({
      tags: ["Code mod releases"],
      summary: "Diff a release against the previous approved one",
      description:
        "`release` and `base` (`{id, mod, version, commit, status}`; `base` is the mod's newest approved release recorded before this one, null for its first release, which has no diff: show its source instead), and `files: [{path, previousPath, status, binary, additions, deletions}]` sorted by path. `status` is `added`, `removed`, `modified` or `renamed` (same contents under a new path; `previousPath` is the old one, null otherwise). `additions` and `deletions` count lines; null for a binary file or one over 1 MiB. `truncated` is true past 500 changed files. The mod's owner and moderators only.",
      responses: {
        200: { description: "The changed files" },
        400: { description: "Invalid request" },
        404: { description: "No release the requester may review has that id" },
      },
    }),
    zValidator("param", ReleaseParam, validationHook),
    async (c) => {
      const db = createDb(c.env.DB);
      const user = c.get("user");
      const found = await loadCodeModRelease(db, c.req.valid("param").id, { requester: user });
      if (!found || !canViewUnapprovedReleases(found.mod.userId, user)) {
        return c.json(notFound, 404);
      }
      c.header("Cache-Control", "private, no-store");
      const release = summary(found.release, found.mod.slug);
      const base = await previousApproved(db, found.release);
      if (!base) return c.json({ release, base: null, files: [], truncated: false }, 200);
      using repo = await c.env.MOD_SOURCES.get(modRepoName(found.mod.id));
      const diff = await diffCommits(repo, base.commitSha, found.release.commitSha);
      if (!diff) return c.json(notFound, 404);
      return c.json({ release, base: summary(base, found.mod.slug), ...diff }, 200);
    }
  )

  // One changed file's unified patch
  .get(
    "/:id/diff/file",
    describeRoute({
      tags: ["Code mod releases"],
      summary: "Get one changed file's patch",
      description:
        "For a file in `diff`'s list, by its `path` (a removed file's old path): the same fields and `patch`, a unified diff (`--- a/` `+++ b/` headers, three lines of context); null for a binary file or one over 1 MiB. The mod's owner and moderators only.",
      responses: {
        200: { description: "The patch" },
        400: { description: "Invalid request" },
        404: { description: "No such release, previous release or changed file" },
      },
    }),
    zValidator("param", ReleaseParam, validationHook),
    zValidator("query", PathQuery, validationHook),
    async (c) => {
      const db = createDb(c.env.DB);
      const user = c.get("user");
      const found = await loadCodeModRelease(db, c.req.valid("param").id, { requester: user });
      if (!found || !canViewUnapprovedReleases(found.mod.userId, user)) {
        return c.json(notFound, 404);
      }
      const base = await previousApproved(db, found.release);
      if (!base) return c.json({ error: "The mod's first release has no diff" }, 404);
      using repo = await c.env.MOD_SOURCES.get(modRepoName(found.mod.id));
      const patch = await diffFile(
        repo,
        base.commitSha,
        found.release.commitSha,
        c.req.valid("query").path
      );
      if (!patch) return c.json({ error: "The file didn't change" }, 404);
      c.header("Cache-Control", "private, no-store");
      return c.json(patch, 200);
    }
  )

  // The release's listing beside the previous approved release's
  .get(
    "/:id/listing",
    describeRoute({
      tags: ["Code mod releases"],
      summary: "Compare a release's listing with the previous approved one",
      description:
        "`release` and `previous` (the mod's newest approved release recorded before it, or null), each `{id, version, status, commit, createdAt, publishedAt, name, description, readme, changelog, tags, homepage, license, icon, screenshots, depends, netplay, hooks, files, state, kind, uses, simWrites}`. `name` and `description` are the packed manifest's, and `netplay`, `hooks` (`{before, after, replaces}`), `files` (`[{path, size}]`, the game files it ships) and `state` come from its first successful build: null (or empty) before one succeeds. `kind` is `script`, `native` or `content` (null before its check), and for a script `uses` is its list and `simWrites` what of that changes a match. `icon` and `screenshots` are `{url, width, height}`. Public for approved releases; the mod's owner and moderators for any.",
      responses: {
        200: { description: "The two listings" },
        400: { description: "Invalid request" },
        404: { description: "No release the requester may read has that id" },
      },
    }),
    zValidator("param", ReleaseParam, validationHook),
    async (c) => {
      const db = createDb(c.env.DB);
      const found = await loadCodeModRelease(db, c.req.valid("param").id, {
        requester: c.get("user"),
      });
      if (!found) return c.json(notFound, 404);
      const previous = await previousApproved(db, found.release);
      const [release, before] = await listings(
        db,
        new URL(c.req.url).origin,
        previous ? [found.release, previous] : [found.release]
      );
      c.header("Cache-Control", cacheControl(found.release));
      return c.json({ release, previous: before ?? null }, 200);
    }
  )

  // An icon or screenshot a release's listing names
  .get(
    "/:id/images/:file",
    describeRoute({
      tags: ["Code mod releases"],
      summary: "Get a release's icon or screenshot",
      description:
        "An image the release's listing names, by `<sha256>.png`. Public for approved releases; the mod's owner and moderators for any.",
      responses: {
        200: { description: "The PNG" },
        400: { description: "Invalid request" },
        404: { description: "No such release or image" },
      },
    }),
    zValidator(
      "param",
      ReleaseParam.extend({
        file: z.string().regex(/^[0-9a-f]{64}\.png$/, "Not an image file name"),
      }),
      validationHook
    ),
    async (c) => {
      const db = createDb(c.env.DB);
      const params = c.req.valid("param");
      const found = await loadCodeModRelease(db, params.id, { requester: c.get("user") });
      if (!found) return c.json(notFound, 404);
      const sha256 = params.file.slice(0, 64);
      const [image] = await db
        .select({ sha256: codeModReleaseImages.sha256 })
        .from(codeModReleaseImages)
        .where(
          and(
            eq(codeModReleaseImages.releaseId, found.release.id),
            eq(codeModReleaseImages.sha256, sha256)
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
          "Cache-Control":
            found.release.status === "approved"
              ? "public, max-age=31536000, immutable"
              : "private, no-store",
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "default-src 'none'; sandbox",
        },
      });
    }
  );

export default app;
