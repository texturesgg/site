import {
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
import { logger } from "@vgskins/logger";
import {
  codeModSetNameSchema,
  codeModSlugSchema,
  type ModDocsMeta,
  type ModDocsRawFile,
  type ModShare,
  type PublicSitemap,
  type SetShare,
} from "@vgskins/shared";
import {
  docsResolveRedirect,
  ModDocsHeaderName,
  ModDocsPage,
  ModDocsWanted,
} from "@vgskins/shared/mod-docs";
import { and, count, eq, isNull, max } from "drizzle-orm";
import { z } from "zod";
import type { Env } from "../types";
import { codeModsEnabled } from "./feature-flags";
import {
  docsCacheHeader,
  getTggMeleeReleases,
  mirroredDocsText,
  orderedDocsPages,
  resolveModDocs,
} from "./mod-docs-mirror";
import { findUserByIdentifier, loadPack, notBanned } from "./queries";
import { listedMods, loadModSummary } from "./registry-listing";

export { getTggMeleeReleases };

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

  // Mods, sets, and mod docs are listed only once code mods are on for everyone.
  const [mods, sets, docs] = codeModsPublic
    ? await Promise.all([
        db
          .select({ id: codeMods.slug, updatedAt: max(codeModReleases.publishedAt) })
          .from(codeMods)
          .innerJoin(codeModReleases, eq(codeModReleases.codeModId, codeMods.id))
          .where(and(eq(codeModReleases.status, "approved"), isNull(codeMods.deletedAt)))
          .groupBy(codeMods.slug),
        db.select({ name: codeModSets.name }).from(codeModSets),
        resolveModDocs(env, "latest")
          .then((resolved) => (resolved ? orderedDocsPages(resolved.index) : []))
          .catch((err) => {
            logger.warn({ err }, "Failed to load latest mod docs index for sitemap");
            return [];
          }),
      ])
    : [[], [], []];

  return {
    games: allGames,
    packs: allPacks,
    users: allUsers,
    mods,
    sets,
    docs,
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

const DocsRawPath = z.string().min(1).max(200);
const DocsMetaPage = z.string().max(200);

/**
 * Title, description, and canonical path for a mod docs route, for search
 * engines and link previews. Canonical URLs point at `latest`.
 */
export async function getModDocsMeta(
  env: Env,
  rawWanted: unknown,
  rawPage: unknown
): Promise<ModDocsMeta | null> {
  const wanted = ModDocsWanted.safeParse(rawWanted);
  const raw = DocsMetaPage.safeParse(rawPage);
  if (!wanted.success || !raw.success) return null;
  if (!(await codeModsEnabled(env.FLAGS, null))) return null;

  const resolved = await resolveModDocs(env, wanted.data);
  if (!resolved) return null;

  const trimmed = raw.data.replace(/^\/+|\/+$/g, "");
  if (trimmed.startsWith("api/")) {
    const name = trimmed.slice(4);
    if (!ModDocsHeaderName.safeParse(name).success) return null;
    if (!resolved.index.headers.includes(`tgg/${name}.h`)) return null;
    return {
      title: `${name}.h - Making mods - textures.gg`,
      description: `C SDK header tgg/${name}.h for tgg-melee.`,
      canonicalPath: `/docs/mods/latest/api/${name}`,
    };
  }

  let page = trimmed || "index";
  const redirected = docsResolveRedirect(resolved.index.redirects, page, "");
  if (redirected) page = redirected.page;
  if (!ModDocsPage.safeParse(page).success) return null;
  const meta = resolved.index.pages[page];
  if (!meta) return null;

  return {
    title:
      page === "index"
        ? `${meta.title} - textures.gg`
        : `${meta.title} - Making mods - textures.gg`,
    description: meta.description,
    canonicalPath: page === "index" ? "/docs/mods/latest" : `/docs/mods/latest/${page}`,
  };
}

/**
 * Raw text docs files served directly by the web Worker: `llms.txt`,
 * `tgg.luau`, and `<page>.md`.
 */
export async function getModDocsRawFile(
  env: Env,
  rawWanted: unknown,
  rawPath: unknown
): Promise<ModDocsRawFile | null> {
  const wanted = ModDocsWanted.safeParse(rawWanted);
  const path = DocsRawPath.safeParse(rawPath);
  if (!wanted.success || !path.success) return null;
  if (!(await codeModsEnabled(env.FLAGS, null))) return null;

  const resolved = await resolveModDocs(env, wanted.data);
  if (!resolved) return null;

  const cacheControl = docsCacheHeader(env, resolved.version);
  const encodedVersion = encodeURIComponent(resolved.version);

  if (path.data === "llms.txt") {
    const body = await mirroredDocsText(env, `${encodedVersion}/docs/llms.txt`, resolved.version);
    return body === null ? null : { contentType: "text/plain; charset=utf-8", cacheControl, body };
  }

  if (path.data === "tgg.luau") {
    const body = await mirroredDocsText(env, `${encodedVersion}/docs/tgg.luau`, resolved.version);
    return body === null ? null : { contentType: "text/plain; charset=utf-8", cacheControl, body };
  }

  if (path.data.endsWith(".md")) {
    const rawPage = path.data.slice(0, -3).replace(/^\/+|\/+$/g, "");
    const redirected = docsResolveRedirect(resolved.index.redirects, rawPage, "");
    const page = redirected ? redirected.page : rawPage;
    if (!ModDocsPage.safeParse(page).success || !(page in resolved.index.pages)) return null;
    const body = await mirroredDocsText(env, `${encodedVersion}/docs/${page}.md`, resolved.version);
    return body === null
      ? null
      : { contentType: "text/markdown; charset=utf-8", cacheControl, body };
  }

  return null;
}
