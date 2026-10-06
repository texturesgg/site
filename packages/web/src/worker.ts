/**
 * Cloudflare Worker that sits in front of static assets.
 * For social bot crawlers (Discord, Twitter, Slack, etc.), it fetches
 * page data from the API and injects Open Graph meta tags into the HTML
 * so link previews show the right title, description, and image.
 *
 * Normal SPA navigations use one canonical shell cache key; asset requests pass through unchanged.
 */

import type { PackOpenGraphData, PublicSitemapData, UserOpenGraphData } from "@vgskins/api";
import { logger } from "@vgskins/logger";
import { isModDocsPath, modDocsLocation } from "./mod-docs";

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
    getSitemap(): Promise<PublicSitemapData>;
    getTggMeleeReleases(): Promise<string[]>;
    getPackOpenGraph(gameSlug: string, packSlug: string): Promise<PackOpenGraphData | null>;
    getUserOpenGraph(identifier: string): Promise<UserOpenGraphData | null>;
  };
};

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

export function staticAssetRequest(request: Request): Request {
  if (request.method !== "GET" && request.method !== "HEAD") return request;
  const acceptsHtml = request.headers.get("accept")?.toLowerCase().includes("text/html");
  const knownBotHtml = isSocialBot(request.headers.get("user-agent"));
  if (!knownBotHtml && !acceptsHtml) return request;

  const url = new URL(request.url);
  if (url.pathname.match(/\.\w+$/)) return request;

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
  url: string;
  type?: string;
}

function buildOgTags(og: OgData): string {
  const tags = [
    `<title>${escapeHtml(og.title)}</title>`,
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

// ─── Route matching ─────────────────────────────────────────────

async function getOgDataForPath(
  api: WorkerEnv["API"],
  assetsBaseUrl: string,
  pathname: string
): Promise<OgData | "not-found" | null> {
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

export function buildSitemapXml(data: PublicSitemapData): string {
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
  entry(`${BASE}/about`, "0.3");

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

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>`;
}

// ─── Main handler ───────────────────────────────────────────────

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
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
        const xml = buildSitemapXml(await env.API.getSitemap());
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

    // Mod docs, as tgg-melee links them: a redirect to the release's docs,
    // temporary because textures.gg will serve these pages itself.
    if (isModDocsPath(url.pathname)) {
      let releases: string[];
      try {
        releases = await env.API.getTggMeleeReleases();
      } catch (err) {
        logger.error({ err }, "Failed to load tgg-melee releases for the mod docs");
        return withResponseHeaders(
          new Response("Docs temporarily unavailable", {
            status: 503,
            headers: { "content-type": "text/plain; charset=UTF-8", "cache-control": "no-store" },
          }),
          env
        );
      }
      const location = modDocsLocation(url.pathname, releases);
      return withResponseHeaders(
        location
          ? new Response(null, {
              status: 302,
              headers: { location, "cache-control": "public, max-age=300" },
            })
          : new Response("Not found", {
              status: 404,
              headers: { "content-type": "text/plain; charset=UTF-8", "cache-control": "no-store" },
            }),
        env
      );
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
    if (isSocialBot(userAgent) && !url.pathname.match(/\.\w+$/)) {
      logger.info(
        { userAgent, path: url.pathname, apiBase: env.API_BASE_URL },
        "Bot detected, resolving OG data"
      );
      const ogData = await getOgDataForPath(env.API, env.ASSETS_BASE_URL, url.pathname);
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
