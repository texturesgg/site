import {
  codeModBuilds,
  codeModReleases,
  codeMods,
  type createDb,
  games,
  packs,
  type schema,
  users,
} from "@vgskins/db";
import type { BuildQueryResult, DBQueryConfig, ExtractTablesWithRelations } from "drizzle-orm";
import { and, eq, exists, inArray, isNull, lte, or } from "drizzle-orm";
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

/**
 * Whether the requester sees a code mod's unapproved releases and builds: its
 * owner and moderators do. Everyone else sees approved releases only.
 */
export function canViewUnapprovedReleases(ownerId: string, user: Requester): boolean {
  return ownerId === user?.id || isModerator(user);
}

/**
 * The code mods the requester may see, as a condition on `codeMods`: not
 * deleted, and with an approved release unless they own it or moderate. Lists
 * filter with this; single mods load through `loadCodeMod`.
 */
export function visibleCodeMods(db: Database, user: Requester) {
  if (isModerator(user)) return isNull(codeMods.deletedAt);
  const approved = exists(
    db
      .select({ id: codeModReleases.id })
      .from(codeModReleases)
      .where(
        and(eq(codeModReleases.codeModId, codeMods.id), eq(codeModReleases.status, "approved"))
      )
  );
  return and(
    isNull(codeMods.deletedAt),
    user ? or(eq(codeMods.userId, user.id), approved) : approved
  );
}

/**
 * Load a code mod the requester may see (`visibleCodeMods`), by its slug.
 * Anything else is undefined, so a hidden mod reads exactly as a missing one.
 * Routes load single code mods through this, never from `codeMods`.
 */
export async function loadCodeMod(db: Database, slug: string, options: { requester: Requester }) {
  const [mod] = await db
    .select()
    .from(codeMods)
    .where(and(eq(codeMods.slug, slug), visibleCodeMods(db, options.requester)));
  return mod;
}

/**
 * Load a build the requester may see, with its release and mod: a build of an
 * approved release, or any build of a mod they own or moderate. Anything else
 * is undefined, as a missing build.
 */
export async function loadCodeModBuild(
  db: Database,
  ref: { id: string } | { packageSha256: string },
  options: { requester: Requester }
) {
  const rows = await db
    .select({ build: codeModBuilds, release: codeModReleases, mod: codeMods })
    .from(codeModBuilds)
    .innerJoin(codeModReleases, eq(codeModReleases.id, codeModBuilds.releaseId))
    .innerJoin(codeMods, eq(codeMods.id, codeModReleases.codeModId))
    .where(
      and(
        "id" in ref
          ? eq(codeModBuilds.id, ref.id)
          : eq(codeModBuilds.packageSha256, ref.packageSha256),
        isNull(codeMods.deletedAt)
      )
    );
  return rows.find(
    (row) =>
      row.release.status === "approved" ||
      canViewUnapprovedReleases(row.mod.userId, options.requester)
  );
}
