import {
  codeModBuilds,
  codeModLayouts,
  codeModReleaseImages,
  codeModReleases,
  codeModSetMods,
  codeMods,
  users,
  type Database,
} from "@vgskins/db";
import { byVersionDescending } from "@vgskins/shared";
import { and, asc, eq, exists, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { CODE_MOD_SYSTEMS, type CodeModSystem, layoutSystem } from "./code-mod-layouts";

// What the registry lists of a mod (routes/registry.ts), shared with the
// public catalog's share cards (lib/public-catalog.ts).

/** The URL a listing's image is served at, by its SHA-256. */
export function imageUrl(origin: string, sha256: string): string {
  return `${origin}/api/registry/images/${sha256}.png`;
}

type Image = { url: string; width: number; height: number };
type Netplay = NonNullable<(typeof codeModBuilds.$inferSelect)["netplay"]>;

/** What the mods list shows of a mod; the details add to it. */
export type ModSummary = {
  id: string;
  name: string;
  description: string | null;
  // The author's account name, kept for older installers; stores show
  // `publisher`.
  author: string;
  // Who publishes it: an admin-set name (first-party mods say "textures.gg")
  // or the author's name, and whether admins vouch for it.
  // `id` is the publishing account's id, which never changes: what tgg
  // remembers a player's trust by.
  publisher: { id: string; name: string; official: boolean };
  icon: Image | null;
  tags: string[];
  installs: number;
  version: string;
  updatedAt: Date;
  sets: string[];
  targets: CodeModSystem[];
  netplay: Netplay | null;
  // "script" for a script mod (one package for every system), else what the
  // release ships ("native", "content"), null before its check recorded it
  kind: "content" | "script" | "native" | null;
  // Whether it loads only on the API minor it was built for (its packed
  // manifest says `experimental`), so a new tgg-melee needs a new build.
  oneVersion: boolean;
};

/** A packed manifest that opts into experimental calls. */
const Experimental = z.object({ experimental: z.literal(true) });

// A listed mod: not deleted, with an approved release.
export function listedMods(db: Database) {
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

export const MOD_COLUMNS = {
  id: codeMods.id,
  slug: codeMods.slug,
  name: codeMods.name,
  description: codeMods.description,
  sourceUrl: codeMods.sourceUrl,
  installs: codeMods.downloadCount,
  author: users.name,
  userId: codeMods.userId,
  publisherName: codeMods.publisherName,
  official: codeMods.official,
};
export type ModRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  installs: number;
  author: string;
  userId: string;
  publisherName: string | null;
  official: boolean;
};

/**
 * The newest tgg-melee release the builder has active layouts for, and the
 * systems they cover: what a mod's `targets` are counted against.
 */
export async function currentPort(
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
export async function summarize(
  db: Database,
  origin: string,
  mods: ModRow[],
  port: Awaited<ReturnType<typeof currentPort>>
): Promise<(ModSummary & { releaseId: string; iconSha256: string | null })[]> {
  if (mods.length === 0) return [];
  const releases = await db
    .select({
      id: codeModReleases.id,
      codeModId: codeModReleases.codeModId,
      version: codeModReleases.version,
      tags: codeModReleases.tags,
      kind: codeModReleases.kind,
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
        iconSha256: icon?.sha256 ?? null,
        id: mod.slug,
        name: typeof manifest.name === "string" ? manifest.name : mod.name,
        description:
          typeof manifest.description === "string" ? manifest.description : mod.description,
        author: mod.author,
        publisher: {
          id: mod.userId,
          name: mod.publisherName ?? mod.author,
          official: mod.official,
        },
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
        kind: release.kind,
        oneVersion: built.some((build) => Experimental.safeParse(build.manifest).success),
      },
    ];
  });
}

/** One listed mod's summary by its id (slug), or null when it isn't listed. */
export async function loadModSummary(
  db: Database,
  origin: string,
  slug: string
): Promise<(ModSummary & { iconSha256: string | null }) | null> {
  const [[mod], port] = await Promise.all([
    db
      .select(MOD_COLUMNS)
      .from(codeMods)
      .innerJoin(users, eq(users.id, codeMods.userId))
      .where(and(eq(codeMods.slug, slug), listedMods(db))),
    currentPort(db),
  ]);
  if (!mod) return null;
  const [summary] = await summarize(db, origin, [mod], port);
  if (!summary) return null;
  const { releaseId: _, ...rest } = summary;
  return rest;
}
