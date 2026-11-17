import {
  codeModLayouts,
  codeModReleaseImages,
  codeModReleases,
  codeModSetMods,
  codeModSets,
  codeMods,
  createDb,
  games,
  packs,
  users,
} from "@vgskins/db";
import {
  codeModSetNameSchema,
  codeModSlugSchema,
  type ModShare,
  type PublicSitemap,
  type SetShare,
} from "@vgskins/shared";
import { and, count, eq, isNull, max } from "drizzle-orm";
import { z } from "zod";
import type { Env } from "../types";
import { codeModsEnabled } from "./feature-flags";
import { findUserByIdentifier, loadPack, notBanned } from "./queries";
import { listedMods, loadModSummary } from "./registry-listing";

const PublicCatalogIdentifier = z.string().min(1).max(200);

export interface PackOpenGraphData {
  title: string;
  description: string | null;
  thumbnailKey: string | null;
  /** Until the queue optimizes a pack's images, only the uploaded originals exist. */
  imageProcessingStatus: (typeof packs.$inferSelect)["imageProcessingStatus"];
  targetName: string | null;
  modCount: number;
}

export interface UserOpenGraphData {
  name: string;
  bio: string | null;
  image: string | null;
}

export function parsePublicCatalogIdentifier(value: unknown): string {
  return PublicCatalogIdentifier.parse(value);
}

export async function getPackOpenGraphData(
  env: Env,
  rawGameSlug: unknown,
  rawPackSlug: unknown
): Promise<PackOpenGraphData | null> {
  const gameSlug = parsePublicCatalogIdentifier(rawGameSlug);
  const packSlug = parsePublicCatalogIdentifier(rawPackSlug);
  const db = createDb(env.DB);
  const pack = await loadPack(
    db,
    { gameSlug, slug: packSlug },
    {
      requester: null,
      with: {
        target: { columns: { name: true } },
        mods: { columns: { id: true } },
      },
    }
  );

  if (!pack) return null;
  return {
    title: pack.title,
    description: pack.description,
    thumbnailKey: pack.thumbnailKey,
    imageProcessingStatus: pack.imageProcessingStatus,
    targetName: pack.target?.name ?? null,
    modCount: pack.mods.length,
  };
}

export async function getUserOpenGraphData(
  env: Env,
  rawIdentifier: unknown
): Promise<UserOpenGraphData | null> {
  const identifier = parsePublicCatalogIdentifier(rawIdentifier);
  const user = await findUserByIdentifier(createDb(env.DB), identifier);
  return user ? { name: user.name, bio: user.bio, image: user.image } : null;
}

export async function getPublicSitemapData(env: Env): Promise<PublicSitemap> {
  const db = createDb(env.DB);
  const [allGames, allPacks, allUsers, codeModsPublic] = await Promise.all([
    db
      .select({
        slug: games.slug,
        updatedAt: games.updatedAt,
      })
      .from(games),
    db
      .select({
        slug: packs.slug,
        gameSlug: games.slug,
        publishedAt: packs.publishedAt,
      })
      .from(packs)
      .innerJoin(games, eq(packs.gameId, games.id))
      .where(and(eq(packs.status, "approved"), isNull(packs.deletedAt))),
    db
      .select({
        name: users.name,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(and(eq(users.onboardingCompleted, true), notBanned())),
    codeModsEnabled(env.FLAGS, null),
  ]);

  // Mods and sets are listed only once code mods are on for everyone.
  const [mods, sets] = codeModsPublic
    ? await Promise.all([
        db
          .select({ id: codeMods.slug, updatedAt: max(codeModReleases.publishedAt) })
          .from(codeMods)
          .innerJoin(codeModReleases, eq(codeModReleases.codeModId, codeMods.id))
          .where(and(eq(codeModReleases.status, "approved"), isNull(codeMods.deletedAt)))
          .groupBy(codeMods.slug),
        db.select({ name: codeModSets.name }).from(codeModSets),
      ])
    : [[], []];

  return {
    games: allGames,
    packs: allPacks,
    users: allUsers,
    mods,
    sets,
  };
}

// Code mods and sets answer only while the code-mods flag is on for someone
// signed out, so with it off a mod link shows no more than it did before.

/** A listed code mod, for its link's tags and share card, or null. */
export async function getModShareData(env: Env, rawId: unknown): Promise<ModShare | null> {
  const id = codeModSlugSchema.parse(rawId);
  if (!(await codeModsEnabled(env.FLAGS, null))) return null;
  const db = createDb(env.DB);
  const summary = await loadModSummary(db, env.API_BASE_URL, id);
  if (!summary) return null;
  return {
    id: summary.id,
    name: summary.name,
    description: summary.description,
    publisher: { name: summary.publisher.name, official: summary.publisher.official },
    version: summary.version,
    kind: summary.kind,
    netplay: summary.netplay,
    icon: summary.iconSha256,
  };
}

/** A set, for its link's tags and share card, or null. */
export async function getSetShareData(env: Env, rawName: unknown): Promise<SetShare | null> {
  const name = codeModSetNameSchema.parse(rawName);
  if (!(await codeModsEnabled(env.FLAGS, null))) return null;
  const db = createDb(env.DB);
  const [[set], [{ modCount }]] = await Promise.all([
    db.select().from(codeModSets).where(eq(codeModSets.name, name)),
    db.select({ modCount: count() }).from(codeModSetMods).where(eq(codeModSetMods.setName, name)),
  ]);
  if (!set) return null;
  return {
    name: set.name,
    title: set.title,
    description: set.description,
    version: set.version,
    modCount,
  };
}

const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);

/**
 * A listing icon's PNG, for a share card: only an image of an approved
 * release of a listed mod, as the registry serves them.
 */
export async function getShareIcon(env: Env, rawSha256: unknown): Promise<Uint8Array | null> {
  const sha256 = Sha256.parse(rawSha256);
  if (!(await codeModsEnabled(env.FLAGS, null))) return null;
  const db = createDb(env.DB);
  const [image] = await db
    .select({ sha256: codeModReleaseImages.sha256 })
    .from(codeModReleaseImages)
    .innerJoin(codeModReleases, eq(codeModReleases.id, codeModReleaseImages.releaseId))
    .innerJoin(codeMods, eq(codeMods.id, codeModReleases.codeModId))
    .where(
      and(
        eq(codeModReleaseImages.sha256, sha256),
        eq(codeModReleases.status, "approved"),
        listedMods(db)
      )
    )
    .limit(1);
  if (!image) return null;
  const object = await env.CODE_MODS.get(`code-mods/images/${sha256}.png`);
  return object ? new Uint8Array(await object.arrayBuffer()) : null;
}

/**
 * Every tgg-melee release the registry has a layout for, active or retired:
 * the versions whose docs textures.gg links to.
 */
export async function getTggMeleeReleases(env: Env): Promise<string[]> {
  const rows = await createDb(env.DB)
    .select({ version: codeModLayouts.portVersion })
    .from(codeModLayouts)
    .where(eq(codeModLayouts.port, "tgg-melee"));
  return rows.map((row) => row.version);
}
