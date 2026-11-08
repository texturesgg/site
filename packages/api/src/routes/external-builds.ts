import { zValidator } from "@hono/zod-validator";
import { codeModBuilds, codeModLayouts, codeModReleases, codeMods, createDb } from "@vgskins/db";
import { logger } from "@vgskins/logger";
import { readSource } from "@vgskins/mod-build/source";
import { storedZip } from "@vgskins/mod-build/zip";
import { generateId } from "@vgskins/shared";
import { unzipSync } from "fflate";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { Hono, type MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { describeRoute } from "hono-openapi";
import { z } from "zod";
import { rateLimitByIp } from "../lib/rate-limit";
import { validationHook } from "../lib/validation";
import type { HonoEnv } from "../types";

// Builds for layouts the builder image can't make (`builder` `external`:
// macOS, which needs Apple's linker and SDK). A machine of the layout's own
// system (packages/mod-build/scripts/external-build.sh, run by
// .github/workflows/macos-mod-builds.yml) asks which approved releases lack a
// build for its layouts, fetches each one's source from here, runs `tgg mod
// build` against the layout's SDK, and uploads the package or the failure.
// The Worker checks the package against the release and layout, hashes it,
// stores it and records the build, as the Workflow does for the image's
// builds. Only approved releases are offered: review covers the source.
//
// Every route takes the Worker secret MOD_BUILDER_TOKEN as a bearer token,
// and answers 404 while it is unset.

// The package passes through this Worker's memory, as the source does
// through the build Workflow's (packages/mod-build/src/source.ts).
const MAX_PACKAGE_BYTES = 64 * 1024 * 1024;
const MAX_LOG_BYTES = 1024 * 1024;
const MAX_REPORT_BYTES = 1024 * 1024;
const MAX_MANIFEST_BYTES = 256 * 1024;
const MAX_UPLOAD_BYTES = MAX_PACKAGE_BYTES + MAX_LOG_BYTES + MAX_REPORT_BYTES + 64 * 1024;
const MAX_PENDING = 50;
// What tgg says a package counts as for netplay.
const NETPLAY_CLASSES = codeModBuilds.netplay.enumValues;

async function sha256(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * The bearer token must be MOD_BUILDER_TOKEN. Both are hashed first, so the
 * comparison takes the same time whatever their lengths.
 */
const requireBuilderToken: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const secret = c.env.MOD_BUILDER_TOKEN;
  if (!secret) return c.json({ error: "Not found" }, 404);
  const given = c.req.header("authorization")?.match(/^Bearer (\S+)$/)?.[1] ?? "";
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([sha256(encoder.encode(given)), sha256(encoder.encode(secret))]);
  // Every byte is compared, so the time taken says nothing about where they differ.
  if (a.reduce((diff, byte, i) => diff | (byte ^ b[i]), 0) !== 0) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  await next();
};

/** JSON with object keys sorted, so two parses of the same value compare equal. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

const ReleaseParam = z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "Invalid release") });
const BuildParam = ReleaseParam.extend({
  layout: z.string().regex(/^[0-9a-f]{16}$/, "Invalid layout"),
});

const SymbolList = z.array(z.string().min(1).max(512)).max(4096);
// What `tgg mod build --json` prints. Only the hooks and netplay class are
// taken from it; the manifest is read from the package itself.
const BuildReport = z.object({
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  size: z.number().int().nonnegative(),
  manifest: z.record(z.string(), z.unknown()),
  canonical_hooks: z.object({
    before: SymbolList.optional(),
    after: SymbolList.optional(),
    replaces: SymbolList.optional(),
  }),
  netplay: z.enum(NETPLAY_CLASSES),
});
// The packed manifest fields that tie a package to its release and layout.
const PackedManifest = z.object({
  api: z.string(),
  id: z.string(),
  version: z.string(),
  entry: z.string().regex(/^[A-Za-z0-9._-]{1,64}$/),
  game_abi: z.string(),
  target: z.string(),
});

const text = (max: number) => z.string().trim().min(1).max(max);
const UploadForm = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("succeeded"),
    builder: text(200),
    run: text(300).optional(),
    log: z.instanceof(File),
    report: z.instanceof(File),
    package: z.instanceof(File),
  }),
  z.object({
    status: z.literal("failed"),
    builder: text(200),
    run: text(300).optional(),
    log: z.instanceof(File),
    error: text(500).optional(),
  }),
]);

/** The active external layout `id`, or undefined. */
async function externalLayout(db: ReturnType<typeof createDb>, id: string) {
  const [layout] = await db
    .select()
    .from(codeModLayouts)
    .where(
      and(
        eq(codeModLayouts.id, id),
        eq(codeModLayouts.active, true),
        eq(codeModLayouts.builder, "external")
      )
    );
  return layout;
}

/** The approved release `id` of a mod that isn't deleted, or undefined. */
async function approvedRelease(db: ReturnType<typeof createDb>, id: string) {
  const [release] = await db
    .select({
      id: codeModReleases.id,
      codeModId: codeModReleases.codeModId,
      version: codeModReleases.version,
      commitSha: codeModReleases.commitSha,
      slug: codeMods.slug,
    })
    .from(codeModReleases)
    .innerJoin(codeMods, eq(codeMods.id, codeModReleases.codeModId))
    .where(
      and(
        eq(codeModReleases.id, id),
        eq(codeModReleases.status, "approved"),
        isNull(codeMods.deletedAt)
      )
    );
  return release;
}

type Checked =
  | { error: string }
  | {
      manifest: Record<string, unknown>;
      canonicalHooks: z.infer<typeof BuildReport>["canonical_hooks"];
      netplay: (typeof NETPLAY_CLASSES)[number];
    };

/**
 * Check that `bytes` is the package `report` describes, of `release`, for
 * `layout`: its manifest.json is the report's, names the release's mod,
 * version and the layout's API, layout id and target, and its library is in
 * the zip.
 */
function checkPackage(
  bytes: Uint8Array,
  digest: string,
  report: z.infer<typeof BuildReport>,
  release: { slug: string; version: string },
  layout: { id: string; api: string; target: string }
): Checked {
  if (report.sha256 !== digest) {
    return { error: `The package hashes to ${digest}, not the report's ${report.sha256}` };
  }
  if (report.size !== bytes.length) {
    return { error: `The package is ${bytes.length} bytes, not the report's ${report.size}` };
  }
  const names: string[] = [];
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (file) => {
        names.push(file.name);
        return file.name === "manifest.json" && file.originalSize <= MAX_MANIFEST_BYTES;
      },
    });
  } catch {
    return { error: "The package isn't a zip" };
  }
  if (names.some((name) => name.startsWith("/") || name.split(/[\\/]/).includes(".."))) {
    return { error: "The package names a path outside its folder" };
  }
  if (!files["manifest.json"]) return { error: "The package has no manifest.json" };
  let manifest: unknown;
  try {
    manifest = JSON.parse(new TextDecoder().decode(files["manifest.json"]));
  } catch {
    return { error: "The package's manifest.json isn't JSON" };
  }
  if (canonicalJson(manifest) !== canonicalJson(report.manifest)) {
    return { error: "The package's manifest.json differs from the report's" };
  }
  const packed = PackedManifest.safeParse(manifest);
  if (!packed.success) {
    return { error: "The package's manifest has no library (entry, game_abi and target)" };
  }
  const expected = {
    id: release.slug,
    version: release.version,
    api: layout.api,
    game_abi: layout.id,
    target: layout.target,
  };
  for (const [field, want] of Object.entries(expected)) {
    const got = packed.data[field as keyof typeof expected];
    if (got !== want) return { error: `The package's ${field} is ${got}, not ${want}` };
  }
  if (!names.includes(packed.data.entry)) {
    return { error: `The package has no ${packed.data.entry}` };
  }
  // A package with a library counts for netplay as code.
  if (report.netplay !== "code") {
    return { error: `A package with a library counts as code, not ${report.netplay}` };
  }
  return {
    manifest: manifest as Record<string, unknown>,
    canonicalHooks: report.canonical_hooks,
    netplay: report.netplay,
  };
}

const app = new Hono<HonoEnv>()
  .use(
    "*",
    rateLimitByIp((env) => env.RATE_LIMIT_UPLOAD)
  )
  .use("*", requireBuilderToken)

  // The approved releases each external layout of `target` still needs a build of
  .get(
    "/pending",
    describeRoute({
      tags: ["External builds"],
      summary: "List releases an external builder should build",
      description:
        "For each active layout of `target` with builder `external`: its id and tgg-melee version, and up to `limit` approved releases, newest first, with neither a build for it nor one for every layout (a package without a library). A failed build is offered again only with `failed=retry`. Needs the builder token.",
      responses: {
        200: { description: "Layouts and the releases they need" },
        400: { description: "Invalid request" },
        401: { description: "Not the builder token" },
        404: { description: "External builds are off" },
      },
    }),
    zValidator(
      "query",
      z.object({
        target: z.string().regex(/^[a-z0-9_]+(-[a-z0-9_]+){2,3}$/, "Invalid target"),
        failed: z.enum(["skip", "retry"]).default("skip"),
        limit: z.coerce.number().int().min(1).max(MAX_PENDING).default(20),
      }),
      validationHook
    ),
    async (c) => {
      const db = createDb(c.env.DB);
      const { target, failed, limit } = c.req.valid("query");
      const layouts = await db
        .select({ id: codeModLayouts.id, portVersion: codeModLayouts.portVersion })
        .from(codeModLayouts)
        .where(
          and(
            eq(codeModLayouts.target, target),
            eq(codeModLayouts.active, true),
            eq(codeModLayouts.builder, "external")
          )
        )
        .orderBy(codeModLayouts.id);
      const approved = layouts.length
        ? await db
            .select({
              id: codeModReleases.id,
              mod: codeMods.slug,
              version: codeModReleases.version,
            })
            .from(codeModReleases)
            .innerJoin(codeMods, eq(codeMods.id, codeModReleases.codeModId))
            .where(and(eq(codeModReleases.status, "approved"), isNull(codeMods.deletedAt)))
            .orderBy(desc(codeModReleases.createdAt))
        : [];
      const builds = approved.length
        ? await db
            .select({
              releaseId: codeModBuilds.releaseId,
              layoutId: codeModBuilds.layoutId,
              status: codeModBuilds.status,
            })
            .from(codeModBuilds)
            .where(
              and(
                inArray(
                  codeModBuilds.releaseId,
                  approved.map((release) => release.id)
                ),
                or(
                  isNull(codeModBuilds.layoutId),
                  inArray(
                    codeModBuilds.layoutId,
                    layouts.map((layout) => layout.id)
                  )
                )
              )
            )
        : [];
      // Releases whose one package (no library) already serves every layout.
      const everyLayout = new Set(
        builds.filter((build) => build.layoutId === null).map((build) => build.releaseId)
      );
      c.header("Cache-Control", "no-store");
      return c.json(
        {
          layouts: layouts.map((layout) => {
            const done = new Set(
              builds
                .filter(
                  (build) =>
                    build.layoutId === layout.id &&
                    (build.status === "succeeded" ||
                      (build.status === "failed" && failed === "skip"))
                )
                .map((build) => build.releaseId)
            );
            const releases = approved
              .filter((release) => !everyLayout.has(release.id) && !done.has(release.id))
              .slice(0, limit);
            return { id: layout.id, target, portVersion: layout.portVersion, releases };
          }),
        },
        200
      );
    }
  )

  // The source of an approved release, as the build Workflow hands it to `tgg mod build`
  .get(
    "/releases/:id/source",
    describeRoute({
      tags: ["External builds"],
      summary: "Download an approved release's source",
      description:
        "A stored zip of manifest.json and src/, include/, files/ and assets/ at the release's commit, for `tgg mod build --source-zip`. Needs the builder token.",
      responses: {
        200: { description: "The source zip" },
        400: { description: "Invalid request" },
        401: { description: "Not the builder token" },
        404: { description: "No approved release has that id" },
      },
    }),
    zValidator("param", ReleaseParam, validationHook),
    async (c) => {
      const db = createDb(c.env.DB);
      const release = await approvedRelease(db, c.req.valid("param").id);
      if (!release) return c.json({ error: "Release not found" }, 404);
      using repo = await c.env.MOD_SOURCES.get(`mod-${release.codeModId}`);
      const commit = await repo.readCommit(release.commitSha);
      if (!commit) return c.json({ error: "Release not found" }, 404);
      const zip = storedZip(await readSource(repo, commit.treeHash));
      return new Response(zip, {
        headers: {
          "Content-Type": "application/zip",
          "Content-Length": String(zip.length),
          "Cache-Control": "no-store",
        },
      });
    }
  )

  // Record an external build of an approved release for a layout: its package, or its failure
  .put(
    "/releases/:id/builds/:layout",
    describeRoute({
      tags: ["External builds"],
      summary: "Upload an external build",
      description:
        "Multipart: `status` (`succeeded` or `failed`), `builder` (what it built with), optional `run` (a CI run URL), `log` (tgg's stderr), and for a success `package` (the zip) and `report` (`tgg mod build --json`'s output), for a failure an optional `error`. The package's manifest must name the release's mod and version and the layout's API, id and target, and match the report. A build that succeeded is never replaced: the same package again is a no-op, another is refused. Needs the builder token.",
      responses: {
        200: { description: "The build, recorded or already there" },
        400: { description: "Invalid request, or a package that doesn't match" },
        401: { description: "Not the builder token" },
        404: { description: "No approved release or external layout has that id" },
        409: { description: "The release already has another package for the layout" },
        413: { description: "Too large" },
      },
    }),
    zValidator("param", BuildParam, validationHook),
    bodyLimit({
      maxSize: MAX_UPLOAD_BYTES,
      onError: (c) => c.json({ error: "The upload is too large" }, 413),
    }),
    async (c) => {
      const db = createDb(c.env.DB);
      const params = c.req.valid("param");
      const [release, layout] = await Promise.all([
        approvedRelease(db, params.id),
        externalLayout(db, params.layout),
      ]);
      if (!release) return c.json({ error: "Release not found" }, 404);
      if (!layout) return c.json({ error: "Layout not found" }, 404);

      const parsed = UploadForm.safeParse(await c.req.parseBody());
      if (!parsed.success) {
        return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid upload" }, 400);
      }
      const form = parsed.data;
      if (form.log.size > MAX_LOG_BYTES) return c.json({ error: "The log is too large" }, 413);

      const existing = await db
        .select()
        .from(codeModBuilds)
        .where(
          and(
            eq(codeModBuilds.releaseId, release.id),
            or(isNull(codeModBuilds.layoutId), eq(codeModBuilds.layoutId, layout.id))
          )
        );
      if (existing.some((build) => build.layoutId === null)) {
        return c.json({ error: "This release has one package for every layout" }, 409);
      }
      const previous = existing[0];

      const status = form.status;
      let fields: Partial<typeof codeModBuilds.$inferInsert>;
      let bytes: Uint8Array<ArrayBuffer> | null = null;
      let digest: string | null = null;
      if (form.status === "succeeded") {
        if (form.package.size > MAX_PACKAGE_BYTES) {
          return c.json({ error: "The package is too large" }, 413);
        }
        if (form.report.size > MAX_REPORT_BYTES) {
          return c.json({ error: "The report is too large" }, 413);
        }
        let report: z.infer<typeof BuildReport>;
        try {
          report = BuildReport.parse(JSON.parse(await form.report.text()));
        } catch {
          return c.json({ error: "The report isn't tgg mod build's JSON" }, 400);
        }
        bytes = new Uint8Array(await form.package.arrayBuffer());
        digest = hex(await sha256(bytes));
        if (previous?.status === "succeeded") {
          if (previous.packageSha256 === digest) {
            return c.json(
              { build: previous.id, status: "succeeded" as const, sha256: digest },
              200
            );
          }
          return c.json({ error: "This release already has another package for the layout" }, 409);
        }
        const checked = checkPackage(bytes, digest, report, release, layout);
        if ("error" in checked) return c.json({ error: checked.error }, 400);
        fields = {
          status: "succeeded",
          packageKey: `code-mods/packages/${digest}.zip`,
          packageSha256: digest,
          packageSize: bytes.length,
          manifest: checked.manifest,
          canonicalHooks: checked.canonicalHooks,
          netplay: checked.netplay,
          error: null,
        };
      } else {
        if (previous?.status === "succeeded") {
          return c.json({ error: "This release already has a package for the layout" }, 409);
        }
        fields = {
          status: "failed",
          packageKey: null,
          packageSha256: null,
          packageSize: null,
          manifest: null,
          canonicalHooks: null,
          netplay: null,
          error: form.error ?? "tgg mod build failed",
        };
      }

      const id = previous?.id ?? generateId();
      const logKey = `code-mods/logs/${id}.log`;
      await c.env.CODE_MODS.put(logKey, await form.log.arrayBuffer(), {
        httpMetadata: { contentType: "text/plain; charset=utf-8" },
      });
      if (bytes && digest) {
        await c.env.CODE_MODS.put(`code-mods/packages/${digest}.zip`, bytes, {
          httpMetadata: { contentType: "application/zip" },
          customMetadata: { build: id, layout: layout.id },
        });
      }
      const now = new Date();
      const row = {
        ...fields,
        image: form.builder,
        runId: form.run ?? null,
        logKey,
        finishedAt: now,
      };
      if (previous) {
        await db
          .update(codeModBuilds)
          .set(row)
          .where(and(eq(codeModBuilds.id, id), eq(codeModBuilds.status, previous.status)));
      } else {
        const inserted = await db
          .insert(codeModBuilds)
          .values({ id, releaseId: release.id, layoutId: layout.id, createdAt: now, ...row })
          .onConflictDoNothing()
          .returning({ id: codeModBuilds.id });
        if (inserted.length === 0) {
          return c.json({ error: "Another upload of this build came first; try again" }, 409);
        }
      }
      logger.info(
        { releaseId: release.id, layout: layout.id, status, sha256: digest },
        "External build recorded"
      );
      return c.json({ build: id, status, sha256: digest }, 200);
    }
  );

export default app;
