import { type createDb, games, packs, type schema, users } from "@vgskins/db";
import type { BuildQueryResult, DBQueryConfig, ExtractTablesWithRelations } from "drizzle-orm";
import { and, eq, inArray, isNull, lte, or } from "drizzle-orm";
import { isModerator } from "./auth";

type Database = ReturnType<typeof createDb>;
type Tables = ExtractTablesWithRelations<typeof schema>;
type PackRelations = DBQueryConfig<"one", true, Tables, Tables["packs"]>["with"];
type LoadedPack<W extends PackRelations> = BuildQueryResult<Tables, Tables["packs"], { with: W }>;

/** A pack by id, or by its game's slug and its own (the `pack_game_slug_idx` key). */
export type PackRef = { id: string } | { gameSlug: string; slug: string };

/** Someone asking for a pack: a signed-in user, or nobody. */
type Requester = { id: string; role?: string } | null | undefined;

/** Find a pack by ID, ensuring it's not deleted. */
export function getPack(db: Database, packId: string) {
  return db.query.packs.findFirst({
    where: and(eq(packs.id, packId), isNull(packs.deletedAt)),
  });
}

/** A pack that is not approved is visible only to its owner and to moderators. */
export function canViewPack(pack: { status: string; userId: string }, user: Requester): boolean {
  return pack.status === "approved" || pack.userId === user?.id || isModerator(user);
}

/**
 * Load a pack the requester may see: not deleted, and approved unless they own
 * it or moderate. Anything else is undefined, so a hidden pack reads exactly as
 * a missing one. Routes load single packs through this, never from `packs`.
 */
export async function loadPack<W extends PackRelations = undefined>(
  db: Database,
  ref: PackRef,
  options: { requester: Requester; with?: W }
): Promise<LoadedPack<W> | undefined> {
  const key =
    "id" in ref
      ? eq(packs.id, ref.id)
      : and(
          inArray(
            packs.gameId,
            db.select({ id: games.id }).from(games).where(eq(games.slug, ref.gameSlug))
          ),
          eq(packs.slug, ref.slug)
        );
  // findFirst types its result from a literal config; a generic `with` is
  // passed through unchanged, so the row has exactly the LoadedPack<W> shape.
  const pack = (await db.query.packs.findFirst({
    where: and(key, isNull(packs.deletedAt)),
    with: options.with,
  })) as LoadedPack<W> | undefined;
  return pack && canViewPack(pack, options.requester) ? pack : undefined;
}

/**
 * A user is public unless a ban is in force. Profiles, Open Graph, the sitemap
 * and top creators all apply this; signedIn refuses sessions by the same rule.
 */
export function notBanned() {
  return or(isNull(users.banned), eq(users.banned, false), lte(users.banExpires, new Date()));
}

/** Find a public user by name first, then by ID. */
export async function findUserByIdentifier(db: Database, identifier: string) {
  return (
    (await db.query.users.findFirst({ where: and(eq(users.name, identifier), notBanned()) })) ??
    (await db.query.users.findFirst({ where: and(eq(users.id, identifier), notBanned()) }))
  );
}
