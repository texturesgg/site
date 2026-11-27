/**
 * Cloudflare Worker that sits in front of static assets.
 * For social bot crawlers (Discord, Twitter, Slack, etc.), it fetches
 * page data from the API and injects Open Graph meta tags into the HTML
 * so link previews show the right title, description, and image.
 *
 * Normal SPA navigations use one canonical shell cache key; asset requests pass through unchanged.
 */

import type { PackOpenGraphData, UserOpenGraphData } from "@vgskins/api";
import { logger } from "@vgskins/logger";
import {
  codeModSetNameSchema,
  codeModSlugSchema,
  type ModDocsMeta,
  ModDocsMetaSchema,
  type ModDocsRawFile,
  ModDocsRawFileSchema,
  type ModShare,
  ModShareSchema,
  PRIMARY_GAME_SLUG,
  type PublicSitemap,
  PublicSitemapSchema,
  type SetShare,
  SetShareSchema,
  ShareIconSchema,
} from "@vgskins/shared";
import { ModDocsWanted } from "@vgskins/shared/mod-docs";
import type { CardInput } from "./share-card/card";
import { modCard, modDescription, setCard, setDescription } from "./share-card/view";

// Headers that are safe for every response. A full Content-Security-Policy
// (scripts, fonts, Turnstile, avatars, API and asset origins) should be rolled
// out report-only first; frame-ancestors alone covers clickjacking today.
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "content-security-policy": "frame-ancestors 'none'",
  "x-frame-options": "DENY",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
};

/** What the fetch handler uses of its bindings, so a test can pass just these. */
export type WorkerEnv = Pick<Env, "ENVIRONMENT" | "API_BASE_URL" | "ASSETS_BASE_URL"> & {
  ASSETS: Pick<Fetcher, "fetch">;
  API: {
    // Answers the shared schemas describe are parsed here, at the edge.
    getSitemap(): Promise<unknown>;
    getPackOpenGraph(gameSlug: string, packSlug: string): Promise<PackOpenGraphData | null>;
    getUserOpenGraph(identifier: string): Promise<UserOpenGraphData | null>;
    getModShare(id: string): Promise<unknown>;
    getSetShare(name: string): Promise<unknown>;
    getShareIcon(sha256: string): Promise<unknown>;
    getModDocsMeta(wanted: string, page: string): Promise<unknown>;
    getModDocsRawFile(wanted: string, path: string): Promise<unknown>;
  };
};

const SITE = "https://textures.gg";

export function withResponseHeaders(response: Response, env: Pick<Env, "ENVIRONMENT">): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
  if (env.ENVIRONMENT === "preview") {
    headers.set("x-robots-tag", "noindex, nofollow, noarchive");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

const BOT_USER_AGENTS = [
  "Discordbot",
  "Twitterbot",
  "facebookexternalhit",
  "LinkedInBot",
  "Slackbot",
  "TelegramBot",
  "WhatsApp",
  "Googlebot",
  "bingbot",
  "Applebot",
  "iMessageLinkPreview",
];

function isSocialBot(userAgent: string | null): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return BOT_USER_AGENTS.some((bot) => ua.includes(bot.toLowerCase()));
}

// Code mod ids have dots (tgg.ucf), so a mod page or its source and review
// pages can end in what looks like a file extension.
const MOD_PAGE = /^\/games\/[^/]+\/mods\/[^/]+(\/[^.]*)?$/;
// Docs pages name a version (/docs/mods/1.0/guides/hud), which isn't a static asset.
const DOCS_PAGE = /^\/docs\/mods(?:\/[^/]+(?:\/[^/.]+)*)?$/;

/** Whether a path names a file (an asset), not a page. */
export function isFilePath(pathname: string): boolean {
  return /\.\w+$/.test(pathname) && !MOD_PAGE.test(pathname) && !DOCS_PAGE.test(pathname);
}

export function staticAssetRequest(request: Request): Request {
  if (request.method !== "GET" && request.method !== "HEAD") return request;
  const acceptsHtml = request.headers.get("accept")?.toLowerCase().includes("text/html");
  const knownBotHtml = isSocialBot(request.headers.get("user-agent"));
  if (!knownBotHtml && !acceptsHtml) return request;

  const url = new URL(request.url);
  if (isFilePath(url.pathname)) return request;

  // Every client route must resolve through one deployment-scoped cache key.
  // Otherwise an older cached route shell can reference hashed assets that a
  // newer Workers Static Assets deployment no longer serves.
  return new Request(url.origin, request);
}

/** Escape user-provided text for an HTML attribute or XML element content */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

interface OgData {
  title: string;
  description: string;
  image?: string;
  /** Set for an image of a known size, such as a share card. */
  imageSize?: { width: number; height: number };
  imageAlt?: string;
  /** The page's canonical URL. */
  url: string;
  type?: string;
}

export function buildOgTags(og: OgData): string {
  const tags = [
    `<title>${escapeHtml(og.title)}</title>`,
    `<link rel="canonical" href="${escapeHtml(og.url)}" />`,
    `<meta property="og:title" content="${escapeHtml(og.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(og.description)}" />`,
    `<meta property="og:url" content="${escapeHtml(og.url)}" />`,
    `<meta property="og:type" content="${og.type || "website"}" />`,
    `<meta property="og:site_name" content="textures.gg" />`,
    `<meta name="description" content="${escapeHtml(og.description)}" />`,
    `<meta name="twitter:card" content="${og.image ? "summary_large_image" : "summary"}" />`,
    `<meta name="twitter:title" content="${escapeHtml(og.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(og.description)}" />`,
  ];

  if (og.image) {
    tags.push(`<meta property="og:image" content="${escapeHtml(og.image)}" />`);
    tags.push(`<meta name="twitter:image" content="${escapeHtml(og.image)}" />`);
  }
  if (og.imageSize) {
    tags.push(`<meta property="og:image:width" content="${og.imageSize.width}" />`);
    tags.push(`<meta property="og:image:height" content="${og.imageSize.height}" />`);
  }
  if (og.imageAlt) {
    tags.push(`<meta property="og:image:alt" content="${escapeHtml(og.imageAlt)}" />`);
    tags.push(`<meta name="twitter:image:alt" content="${escapeHtml(og.imageAlt)}" />`);
  }

  return tags.join("\n    ");
}

function injectOgTags(html: string, ogTags: string): string {
  // Replace existing OG tags and title with dynamic ones
  // Remove existing og/twitter meta tags and title to avoid duplicates
  let cleaned = html;
  cleaned = cleaned.replace(/<meta\s+property="og:[^"]*"\s+content="[^"]*"\s*\/?>/gi, "");
  cleaned = cleaned.replace(/<meta\s+name="twitter:[^"]*"\s+content="[^"]*"\s*\/?>/gi, "");
  cleaned = cleaned.replace(/<meta\s+name="description"\s+content="[^"]*"\s*\/?>/gi, "");
  cleaned = cleaned.replace(/<title>[^<]*<\/title>/i, "");
  cleaned = cleaned.replace(/<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/gi, "");

  // Inject after <meta charset>
  return cleaned.replace(
    /<meta\s+charset="UTF-8"\s*\/?>/i,
    `<meta charset="UTF-8" />\n    ${ogTags}`
  );
}

/**
 * The pack's cover image, as the pack page shows it: the optimized
 * `_full.webp` once processed, else the uploaded original. Production does
 * not serve the bare key once optimized variants exist.
 */
function getPackImageUrl(
  assetsBaseUrl: string,
  pack: Pick<PackOpenGraphData, "thumbnailKey" | "imageProcessingStatus">
): string | undefined {
  if (!pack.thumbnailKey) return undefined;
  const base = `${assetsBaseUrl.replace(/\/$/, "")}/${pack.thumbnailKey}`;
  const originals = ["pending", "processing", "failed"].includes(pack.imageProcessingStatus);
  return originals ? base : `${base}_full.webp`;
}

// ─── Route handlers ─────────────────────────────────────────────

export function buildPackOpenGraphData(
  pack: PackOpenGraphData,
  assetsBaseUrl: string,
  gameSlug: string,
  packSlug: string
): OgData {
  return {
    title: `${pack.title} - textures.gg`,
    description:
      pack.description ||
      `Texture pack with ${pack.modCount} mod${pack.modCount !== 1 ? "s" : ""}${pack.targetName ? ` for ${pack.targetName}` : ""} on textures.gg`,
    image: getPackImageUrl(assetsBaseUrl, pack),
    url: `https://textures.gg/games/${gameSlug}/packs/${packSlug}`,
  };
}

export function buildUserOpenGraphData(user: UserOpenGraphData, username: string): OgData {
  return {
    title: `${user.name} - textures.gg`,
    description: user.bio || `${user.name}'s profile on textures.gg`,
    image: user.image || undefined,
    url: `https://textures.gg/users/${username}`,
    type: "profile",
  };
}

/**
 * "not-found" when the catalog has no public record (the RPC returned null);
 * null when the lookup failed, which keeps the plain SPA shell.
 */
export async function resolveOpenGraphData<T>(
  load: () => Promise<T | null>,
  build: (value: T) => OgData,
  context: Record<string, unknown>
): Promise<OgData | "not-found" | null> {
  try {
    const value = await load();
    return value ? build(value) : "not-found";
  } catch (err) {
    // A failed lookup silently drops the crawler's Open Graph tags and serves
    // the plain SPA shell. Log the error with the route identifiers so a broken
    // preview can be traced to the catalog RPC instead of a bad URL.
    logger.warn({ err, ...context }, "Open Graph catalog lookup failed");
    return null;
  }
}

function handlePackPage(
  api: WorkerEnv["API"],
  assetsBaseUrl: string,
  gameSlug: string,
  packSlug: string
): Promise<OgData | "not-found" | null> {
  return resolveOpenGraphData(
    () => api.getPackOpenGraph(gameSlug, packSlug),
    (pack) => buildPackOpenGraphData(pack, assetsBaseUrl, gameSlug, packSlug),
    { gameSlug, packSlug }
  );
}

function handleUserPage(
  api: WorkerEnv["API"],
  username: string
): Promise<OgData | "not-found" | null> {
  return resolveOpenGraphData(
    () => api.getUserOpenGraph(username),
    (user) => buildUserOpenGraphData(user, username),
    { username }
  );
}

function handleGamePage(gameSlug: string): OgData {
  // Capitalize game name from slug
  const gameName = gameSlug.charAt(0).toUpperCase() + gameSlug.slice(1);
  return {
    title: `${gameName} Textures - textures.gg`,
    description: `Browse and download texture mods for ${gameName} on textures.gg`,
    url: `https://textures.gg/games/${gameSlug}`,
  };
}

const CARD_SIZE = { width: 1200, height: 630 };

/**
 * A mod page's tags. The card URL carries the version so a new release gets
 * a new card past every cache, the site's and the networks'.
 */
export function buildModOpenGraphData(mod: ModShare, origin: string, gameSlug: string): OgData {
  return {
    title: `${mod.name} - textures.gg`,
    description: modDescription(mod),
    image: `${origin}/cards/mods/${mod.id}.png?v=${encodeURIComponent(mod.version)}`,
    imageSize: CARD_SIZE,
    imageAlt: `${mod.name}, a Melee mod by ${mod.publisher.name}`,
    url: `${SITE}/games/${gameSlug}/mods/${mod.id}`,
  };
}

export function buildSetOpenGraphData(set: SetShare, origin: string, gameSlug: string): OgData {
  return {
    title: `${set.title} - textures.gg`,
    description: setDescription(set),
    image: `${origin}/cards/sets/${set.name}.png?v=${set.version}`,
    imageSize: CARD_SIZE,
    imageAlt: `${set.title}, a set of Melee mods`,
    url: `${SITE}/games/${gameSlug}/sets/${set.name}`,
  };
}

/**
 * A mod or set from the catalog, or null when there's none to show: missing,
 * not public, code mods off for people signed out, or a failed lookup (which
 * is logged). Any of these keeps the plain SPA shell, as before mods had tags.
 */
async function loadShare<T>(
  load: () => Promise<unknown>,
  schema: { parse(value: unknown): T },
  context: Record<string, unknown>
): Promise<T | null> {
  try {
    const value = await load();
    return value === null ? null : schema.parse(value);
  } catch (err) {
    logger.warn({ err, ...context }, "Share catalog lookup failed");
    return null;
  }
}

const NullableModShare = ModShareSchema.nullable();
const NullableSetShare = SetShareSchema.nullable();
const NullableModDocsMeta = ModDocsMetaSchema.nullable();
const NullableModDocsRawFile = ModDocsRawFileSchema.nullable();

export function buildDocsOpenGraphData(meta: ModDocsMeta): OgData {
  return {
    title: meta.title,
    description: meta.description,
    url: `${SITE}${meta.canonicalPath}`,
  };
}

async function handleDocsPage(
  api: WorkerEnv["API"],
  rawWanted: string,
  page: string
): Promise<OgData | null> {
  const wanted = ModDocsWanted.safeParse(rawWanted === "0.1" ? "latest" : rawWanted);
  if (!wanted.success) return null;
  const meta = await loadShare(() => api.getModDocsMeta(wanted.data, page), NullableModDocsMeta, {
    wanted: wanted.data,
    page,
  });
  return meta ? buildDocsOpenGraphData(meta) : null;
}

// ─── Raw mod docs files (.md, llms.txt, tgg.luau) ───────────────

type DocsRawTarget =
  | { kind: "redirect"; location: string }
  | { kind: "file"; wanted: string; path: string };

export function matchDocsRawPath(pathname: string): DocsRawTarget | null {
  if (pathname === "/docs/mods/llms.txt") {
    return { kind: "file", wanted: "latest", path: "llms.txt" };
  }
  const versioned = pathname.match(/^\/docs\/mods\/([^/]+)\/(.+)$/);
  if (!versioned) return null;
  const [, rawWanted, rest] = versioned;
  if (rest !== "llms.txt" && rest !== "tgg.luau" && !rest.endsWith(".md")) return null;
  if (rawWanted === "0.1") {
    return { kind: "redirect", location: `/docs/mods/latest/${rest}` };
  }
  return { kind: "file", wanted: rawWanted, path: rest };
}

export async function handleDocsRawFile(
  request: Request,
  env: Pick<WorkerEnv, "API">,
  target: DocsRawTarget
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") return notFound();
  if (target.kind === "redirect") {
    return new Response(null, { status: 302, headers: { location: target.location } });
  }
  const wanted = ModDocsWanted.safeParse(target.wanted);
  if (!wanted.success) return notFound();

  let file: ModDocsRawFile | null;
  try {
    file = NullableModDocsRawFile.parse(await env.API.getModDocsRawFile(wanted.data, target.path));
  } catch (err) {
    logger.warn({ err, wanted: wanted.data, path: target.path }, "Mod docs raw file lookup failed");
    return new Response("Docs temporarily unavailable", {
      status: 503,
      headers: {
        "content-type": "text/plain; charset=UTF-8",
        "cache-control": "no-store",
        "retry-after": "60",
      },
    });
  }
  if (!file) return notFound();

  return new Response(request.method === "HEAD" ? null : file.body, {
    status: 200,
    headers: {
      "content-type": file.contentType,
      "cache-control": file.cacheControl,
    },
  });
}

async function handleModPage(
  api: WorkerEnv["API"],
  origin: string,
  gameSlug: string,
  rawId: string
): Promise<OgData | null> {
  const id = codeModSlugSchema.safeParse(rawId);
  if (!id.success) return null;
  const mod = await loadShare(() => api.getModShare(id.data), NullableModShare, { modId: rawId });
  return mod ? buildModOpenGraphData(mod, origin, gameSlug) : null;
}

async function handleSetPage(
  api: WorkerEnv["API"],
  origin: string,
  gameSlug: string,
  rawName: string
): Promise<OgData | null> {
  const name = codeModSetNameSchema.safeParse(rawName);
  if (!name.success) return null;
  const set = await loadShare(() => api.getSetShare(name.data), NullableSetShare, {
    setName: rawName,
  });
  return set ? buildSetOpenGraphData(set, origin, gameSlug) : null;
}

// ─── Share cards ────────────────────────────────────────────────

const CARD_PATH = /^\/cards\/(mods|sets)\/([^/]+)\.png$/;
// A day: a card changes with a new version (its URL's ?v=), and rarely
// otherwise (a publisher's name, a mod's netplay class).
const CARD_CACHE_CONTROL = "public, max-age=86400";

export function isCardPath(pathname: string): boolean {
  return CARD_PATH.test(pathname);
}

function notFound(): Response {
  return new Response("Not found", {
    status: 404,
    headers: {
      "content-type": "text/plain; charset=UTF-8",
      "cache-control": "public, max-age=300",
    },
  });
}

/**
 * A mod's or set's share card as a PNG, drawn on first request and kept in
 * `cache` by URL. A 404 for anything the catalog doesn't show, which with
 * code mods off is everything.
 */
export async function handleCard(
  request: Request,
  env: Pick<WorkerEnv, "API" | "ASSETS">,
  cache: Pick<Cache, "match" | "put">,
  ctx: Pick<ExecutionContext, "waitUntil">
): Promise<Response> {
  const api = env.API;
  const url = new URL(request.url);
  const match = CARD_PATH.exec(url.pathname);
  if (!match || (request.method !== "GET" && request.method !== "HEAD")) return notFound();
  const cacheKey = new Request(url.toString(), { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const [, kind, key] = match;
  let card: Omit<CardInput, "iconData"> | null = null;
  let iconSha256: string | null = null;
  if (kind === "mods") {
    const id = codeModSlugSchema.safeParse(key);
    const mod = id.success
      ? await loadShare(() => api.getModShare(id.data), NullableModShare, { modId: key })
      : null;
    if (mod) {
      card = modCard(mod);
      iconSha256 = mod.icon;
    }
  } else {
    const name = codeModSetNameSchema.safeParse(key);
    const set = name.success
      ? await loadShare(() => api.getSetShare(name.data), NullableSetShare, { setName: key })
      : null;
    if (set) card = setCard(set);
  }
  if (!card) return notFound();

  const icon = iconSha256
    ? await loadShare(() => api.getShareIcon(iconSha256), ShareIconSchema, { iconSha256 })
    : null;
  // The renderer and its WebAssembly load only for a card.
  const { CARD_FONT_FILES, pngDataUrl, renderCard } = await import("./share-card/render");
  const font = async (path: string) => {
    const res = await env.ASSETS.fetch(new Request(new URL(path, url.origin)));
    if (!res.ok) throw new Error(`The card font ${path} answered ${res.status}`);
    return res.arrayBuffer();
  };
  const [regular, bold] = await Promise.all([
    font(CARD_FONT_FILES.regular),
    font(CARD_FONT_FILES.bold),
  ]);
  const png = await renderCard(
    { ...card, iconData: icon ? pngDataUrl(icon) : null },
    { regular, bold }
  );
  const response = new Response(new Uint8Array(png), {
    headers: { "content-type": "image/png", "cache-control": CARD_CACHE_CONTROL },
  });
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

const STATIC_OG: Readonly<Record<string, Omit<OgData, "url">>> = {
  "/download": {
    title: "Download the app - textures.gg",
    description: "Get the textures.gg desktop app for Melee skins and mods.",
  },
  "/guides": {
    title: "Install guide - textures.gg",
    description: "How to install custom skins and texture packs in Super Smash Bros. Melee.",
  },
  "/about": {
    title: "About - textures.gg",
    description: "Community archive for Super Smash Bros. Melee skins, texture packs, and mods.",
  },
  "/faq": {
    title: "FAQ - textures.gg",
    description:
      "Answers to common questions about textures.gg, tgg-melee, Slippi, mod safety, ISOs, platforms, and open source.",
  },
  "/competition": {
    title: "Mod competition - textures.gg",
    description:
      "Make a Melee mod for tgg-melee. Entries and voting run Dec 4 to Dec 18, 2026. The top three share $500: $250, $150 and $100.",
  },
  "/legal/terms": {
    title: "Terms of service - textures.gg",
    description: "Terms governing your use of textures.gg.",
  },
  "/legal/privacy": {
    title: "Privacy policy - textures.gg",
    description: "What data textures.gg collects and how it is used.",
  },
  "/legal/copyright": {
    title: "Copyright and DMCA - textures.gg",
    description:
      "How to request attribution fixes or submit a DMCA takedown notice on textures.gg.",
  },
};

// ─── Route matching ─────────────────────────────────────────────

async function getOgDataForPath(
  api: WorkerEnv["API"],
  assetsBaseUrl: string,
  origin: string,
  pathname: string
): Promise<OgData | "not-found" | null> {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const staticPage = STATIC_OG[normalized];
  if (staticPage) {
    return { ...staticPage, url: `${SITE}${normalized}` };
  }

  // /docs/mods, /docs/mods/:version, /docs/mods/:version/*
  if (normalized === "/docs/mods") {
    return handleDocsPage(api, "latest", "index");
  }
  const docsMatch = normalized.match(/^\/docs\/mods\/([^/]+)(?:\/(.+))?$/);
  if (docsMatch) {
    return handleDocsPage(api, docsMatch[1], docsMatch[2] ?? "index");
  }

  // /games/melee/mods/:modId and /games/melee/sets/:setName (code mods are
  // Melee's only)
  const modMatch = pathname.match(/^\/games\/([^/]+)\/mods\/([^/]+)\/?$/);
  if (modMatch && modMatch[1] === PRIMARY_GAME_SLUG) {
    return handleModPage(api, origin, modMatch[1], modMatch[2]);
  }
  const setMatch = pathname.match(/^\/games\/([^/]+)\/sets\/([^/]+)\/?$/);
  if (setMatch && setMatch[1] === PRIMARY_GAME_SLUG) {
    return handleSetPage(api, origin, setMatch[1], setMatch[2]);
  }

  // /games/:slug/packs/:packSlug
  const packMatch = pathname.match(/^\/games\/([^/]+)\/packs\/([^/]+)\/?$/);
  if (packMatch) {
    return handlePackPage(api, assetsBaseUrl, packMatch[1], packMatch[2]);
  }

  // /users/:username
  const userMatch = pathname.match(/^\/users\/([^/]+)\/?$/);
  if (userMatch) {
    return handleUserPage(api, userMatch[1]);
  }

  // /games/:slug
  const gameMatch = pathname.match(/^\/games\/([^/]+)\/?$/);
  if (gameMatch) {
    return handleGamePage(gameMatch[1]);
  }

  return null;
}

// ─── Sitemap generation ─────────────────────────────────────────

type SitemapDate = Date | null | undefined;

function formatDate(value: SitemapDate): string | null {
  if (!value) return null;
  try {
    return value.toISOString().split("T")[0];
  } catch {
    return null;
  }
}

export function buildSitemapXml(data: PublicSitemap): string {
  const BASE = "https://textures.gg";
  const urls: string[] = [];

  const entry = (loc: string, priority: string, lastmod?: string | null) => {
    let xml = `  <url>\n    <loc>${escapeHtml(loc)}</loc>\n    <priority>${priority}</priority>`;
    if (lastmod) {
      xml += `\n    <lastmod>${lastmod}</lastmod>`;
    }
    xml += "\n  </url>";
    urls.push(xml);
  };

  // Static pages
  entry(`${BASE}/`, "1.0");
  entry(`${BASE}/download`, "0.7");
  entry(`${BASE}/guides`, "0.6");
  entry(`${BASE}/faq`, "0.5");
  entry(`${BASE}/about`, "0.3");
  entry(`${BASE}/legal/terms`, "0.2");
  entry(`${BASE}/legal/privacy`, "0.2");
  entry(`${BASE}/legal/copyright`, "0.2");

  // Games
  for (const game of data.games) {
    entry(`${BASE}/games/${game.slug}`, "0.9", formatDate(game.updatedAt));
  }

  // Packs
  for (const pack of data.packs) {
    entry(`${BASE}/games/${pack.gameSlug}/packs/${pack.slug}`, "0.8", formatDate(pack.publishedAt));
  }

  // Users
  for (const user of data.users) {
    entry(`${BASE}/users/${encodeURIComponent(user.name)}`, "0.5", formatDate(user.updatedAt));
  }

  // Code mods, sets, mod docs, and the competition (empty while code mods are off for people signed out)
  if (data.mods.length > 0 || data.sets.length > 0 || data.docs.length > 0) {
    entry(`${BASE}/competition`, "0.7");
  }
  for (const mod of data.mods) {
    entry(`${BASE}/games/${PRIMARY_GAME_SLUG}/mods/${mod.id}`, "0.8", formatDate(mod.updatedAt));
  }
  for (const set of data.sets) {
    entry(`${BASE}/games/${PRIMARY_GAME_SLUG}/sets/${set.name}`, "0.7");
  }
  for (const page of data.docs) {
    entry(
      page === "index" ? `${BASE}/docs/mods/latest` : `${BASE}/docs/mods/latest/${page}`,
      page === "index" ? "0.8" : "0.7"
    );
  }

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>`;
}

// ─── Main handler ───────────────────────────────────────────────

export default {
  async fetch(
    request: Request,
    env: WorkerEnv,
    ctx: Pick<ExecutionContext, "waitUntil">
  ): Promise<Response> {
    const url = new URL(request.url);
    const userAgent = request.headers.get("user-agent");

    if (env.ENVIRONMENT === "preview" && url.pathname === "/robots.txt") {
      return withResponseHeaders(
        new Response("User-agent: *\nDisallow: /\n", {
          headers: { "content-type": "text/plain; charset=UTF-8" },
        }),
        env
      );
    }

    // Dynamic sitemap generation
    if (url.pathname === "/sitemap.xml") {
      try {
        const xml = buildSitemapXml(PublicSitemapSchema.parse(await env.API.getSitemap()));
        return withResponseHeaders(
          new Response(xml, {
            headers: {
              "content-type": "application/xml",
              "cache-control": "public, max-age=3600",
            },
          }),
          env
        );
      } catch (err) {
        // There is no static sitemap; the SPA shell in its place would read as
        // a valid page. Crawlers retry a 503.
        logger.error({ err }, "Failed to generate the sitemap");
        return withResponseHeaders(
          new Response("Sitemap temporarily unavailable", {
            status: 503,
            headers: {
              "content-type": "text/plain; charset=UTF-8",
              "cache-control": "no-store",
              "retry-after": "300",
            },
          }),
          env
        );
      }
    }

    if (isCardPath(url.pathname)) {
      return withResponseHeaders(
        await handleCard(request, env, await caches.open("share-cards"), ctx),
        env
      );
    }

    const docsRaw = matchDocsRawPath(url.pathname);
    if (docsRaw) {
      return withResponseHeaders(await handleDocsRawFile(request, env, docsRaw), env);
    }

    // A hashed asset this deployment does not have is a 404. Static Assets'
    // single-page fallback would answer with the HTML shell, which a browser
    // then fails to run as a script and public/_headers caches for a year.
    if (url.pathname.startsWith("/assets/")) {
      const asset = await env.ASSETS.fetch(request);
      if (!asset.headers.get("content-type")?.startsWith("text/html")) {
        return withResponseHeaders(asset, env);
      }
      await asset.body?.cancel();
      return withResponseHeaders(
        new Response("Not found", {
          status: 404,
          headers: { "content-type": "text/plain; charset=UTF-8", "cache-control": "no-store" },
        }),
        env
      );
    }

    // Only intercept for social bots on HTML pages (not assets)
    if (isSocialBot(userAgent) && !isFilePath(url.pathname)) {
      logger.info(
        { userAgent, path: url.pathname, apiBase: env.API_BASE_URL },
        "Bot detected, resolving OG data"
      );
      const ogData = await getOgDataForPath(env.API, env.ASSETS_BASE_URL, url.origin, url.pathname);
      logger.info(
        { ogData, path: url.pathname },
        ogData ? "OG data resolved" : "No OG data for path"
      );

      // Crawlers get a real 404 for a missing pack or user. Browsers always get the
      // canonical SPA shell, which renders the not-found page client-side.
      if (ogData === "not-found") {
        const assetResponse = await env.ASSETS.fetch(staticAssetRequest(request));
        return withResponseHeaders(
          new Response(assetResponse.body, {
            status: 404,
            headers: {
              "content-type": "text/html;charset=UTF-8",
              "cache-control": "public, max-age=300",
            },
          }),
          env
        );
      }

      if (ogData) {
        // Fetch the SPA index.html from static assets
        const assetResponse = await env.ASSETS.fetch(staticAssetRequest(request));
        const html = await assetResponse.text();
        const ogTags = buildOgTags(ogData);
        const modifiedHtml = injectOgTags(html, ogTags);

        return withResponseHeaders(
          new Response(modifiedHtml, {
            headers: {
              "content-type": "text/html;charset=UTF-8",
              "cache-control": "public, max-age=300",
            },
          }),
          env
        );
      }
    }

    // For normal users or unmatched routes, serve static assets as usual
    return withResponseHeaders(await env.ASSETS.fetch(staticAssetRequest(request)), env);
  },
};
