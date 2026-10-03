import { createDb, games, packs, users } from "@vgskins/db";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Env } from "../types";
import { findUserByIdentifier, loadPack, notBanned } from "./queries";

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

export interface PublicSitemapData {
  games: Array<{ slug: string; updatedAt: Date }>;
  packs: Array<{ slug: string; gameSlug: string; publishedAt: Date | null }>;
  users: Array<{ name: string; updatedAt: Date }>;
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

export async function getPublicSitemapData(env: Env): Promise<PublicSitemapData> {
  const db = createDb(env.DB);
  const [allGames, allPacks, allUsers] = await Promise.all([
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
  ]);

  return { games: allGames, packs: allPacks, users: allUsers };
}
