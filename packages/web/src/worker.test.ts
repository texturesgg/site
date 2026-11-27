import { logger } from "@vgskins/logger";
import { describe, expect, it, vi } from "vitest";
import type { ModShare } from "@vgskins/shared";
import { modCard } from "./share-card/view";
import worker, {
  buildModOpenGraphData,
  buildOgTags,
  buildPackOpenGraphData,
  handleCard,
  buildSitemapXml,
  buildUserOpenGraphData,
  resolveOpenGraphData,
  SECURITY_HEADERS,
  staticAssetRequest,
  withResponseHeaders,
  type WorkerEnv,
} from "./worker";

describe("public catalog RPC rendering", () => {
  it("builds pack Open Graph data from the RPC value", () => {
    expect(
      buildPackOpenGraphData(
        {
          title: "Falcon Pack",
          description: null,
          thumbnailKey: "packs/pack-1/images/0",
          imageProcessingStatus: "succeeded",
          targetName: "Captain Falcon",
          modCount: 2,
        },
        "https://api-preview.textures.gg/api/files",
        "melee",
        "falcon-pack"
      )
    ).toEqual({
      title: "Falcon Pack - textures.gg",
      description: "Texture pack with 2 mods for Captain Falcon on textures.gg",
      image: "https://api-preview.textures.gg/api/files/packs/pack-1/images/0_full.webp",
      url: "https://textures.gg/games/melee/packs/falcon-pack",
    });
  });

  it("links the pack image variant that exists for each processing state", () => {
    const image = (
      imageProcessingStatus: "pending" | "processing" | "succeeded" | "failed" | "skipped"
    ) =>
      buildPackOpenGraphData(
        {
          title: "Falcon Pack",
          description: null,
          thumbnailKey: "packs/pack-1/images/0",
          imageProcessingStatus,
          targetName: null,
          modCount: 1,
        },
        "https://assets.textures.gg/",
        "melee",
        "falcon-pack"
      ).image;
    for (const status of ["pending", "processing", "failed"] as const)
      expect(image(status)).toBe("https://assets.textures.gg/packs/pack-1/images/0");
    for (const status of ["succeeded", "skipped"] as const)
      expect(image(status)).toBe("https://assets.textures.gg/packs/pack-1/images/0_full.webp");
  });

  it("builds user Open Graph data from the RPC value", () => {
    expect(
      buildUserOpenGraphData(
        {
          name: "Ciao",
          bio: "Mod creator",
          image: "https://example.com/avatar.png",
        },
        "Ciao"
      )
    ).toEqual({
      title: "Ciao - textures.gg",
      description: "Mod creator",
      image: "https://example.com/avatar.png",
      url: "https://textures.gg/users/Ciao",
      type: "profile",
    });
  });

  it("preserves the graceful fallback and logs the lookup context when an RPC lookup fails", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    try {
      await expect(
        resolveOpenGraphData(
          async () => {
            throw new Error("RPC unavailable");
          },
          () => ({
            title: "unreachable",
            description: "unreachable",
            url: "https://textures.gg/unreachable",
          }),
          { gameSlug: "melee", packSlug: "falcon-pack" }
        )
      ).resolves.toBeNull();
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({ gameSlug: "melee", packSlug: "falcon-pack" }),
        "Open Graph catalog lookup failed"
      );
    } finally {
      warn.mockRestore();
    }
  });

  it("reports a missing public record as not found", async () => {
    await expect(
      resolveOpenGraphData(
        async () => null,
        () => {
          throw new Error("must not build Open Graph data for a missing record");
        },
        { username: "Ciao" }
      )
    ).resolves.toBe("not-found");
  });

  it("builds the sitemap from the RPC value", () => {
    const xml = buildSitemapXml({
      games: [{ slug: "melee", updatedAt: new Date("2026-08-01T00:00:00Z") }],
      packs: [
        {
          slug: "falcon-pack",
          gameSlug: "melee",
          publishedAt: new Date("2026-08-02T00:00:00Z"),
        },
      ],
      users: [{ name: "Ciao", updatedAt: new Date("2026-08-03T00:00:00Z") }],
      mods: [{ id: "tgg.ucf", updatedAt: new Date("2026-11-11T00:00:00Z") }],
      sets: [{ name: "competitive" }],
      docs: ["index", "start/quickstart", "guides/hud"],
    });

    expect(xml).toContain("https://textures.gg/games/melee");
    expect(xml).toContain("https://textures.gg/games/melee/packs/falcon-pack");
    expect(xml).toContain("https://textures.gg/users/Ciao");
    expect(xml).toContain("<lastmod>2026-08-02</lastmod>");
    expect(xml).toContain("https://textures.gg/games/melee/mods/tgg.ucf");
    expect(xml).toContain("https://textures.gg/games/melee/sets/competitive");
    expect(xml).toContain("<loc>https://textures.gg/competition</loc>");
    expect(xml).toContain("<loc>https://textures.gg/docs/mods/latest</loc>");
    expect(xml).toContain("<loc>https://textures.gg/docs/mods/latest/start/quickstart</loc>");
    expect(xml).toContain("<loc>https://textures.gg/docs/mods/latest/guides/hud</loc>");
  });

  it("keeps a user name from breaking out of its sitemap entry", () => {
    const xml = buildSitemapXml({
      games: [],
      packs: [],
      users: [{ name: "a&b</loc><x>", updatedAt: new Date("2026-08-03T00:00:00Z") }],
      mods: [],
      sets: [],
      docs: [],
    });

    expect(xml).toContain("<loc>https://textures.gg/users/a%26b%3C%2Floc%3E%3Cx%3E</loc>");
    expect(xml).not.toContain("<x>");
    expect(xml).not.toContain("/competition");
  });
});

describe("static asset routing", () => {
  it("serves every SPA navigation from the canonical shell cache key", () => {
    const request = new Request("https://textures.gg/games/melee/packs/falco?selected=neutral", {
      headers: { accept: "text/html,application/xhtml+xml" },
    });

    expect(staticAssetRequest(request).url).toBe("https://textures.gg/");
  });

  it("matches the HTML media type case-insensitively", () => {
    const request = new Request("https://textures.gg/games/melee", {
      headers: { accept: "Text/HTML" },
    });

    expect(staticAssetRequest(request).url).toBe("https://textures.gg/");
  });

  it("canonicalizes known bot HTML without an Accept header", () => {
    const request = new Request("https://textures.gg/games/melee/packs/falco", {
      headers: { "user-agent": "Discordbot/2.0" },
    });

    expect(staticAssetRequest(request).url).toBe("https://textures.gg/");
  });

  it("preserves hashed asset requests", () => {
    const request = new Request("https://textures.gg/assets/dat_parser_bg-abc123.wasm", {
      headers: { accept: "*/*" },
    });

    expect(staticAssetRequest(request).url).toBe(request.url);
  });
});

describe("response headers", () => {
  it("adds security headers and keeps status and body", async () => {
    const response = withResponseHeaders(
      new Response("<html></html>", { status: 404, headers: { "content-type": "text/html" } }),
      { ENVIRONMENT: "production" }
    );
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("<html></html>");
    expect(response.headers.get("content-type")).toBe("text/html");
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      expect(response.headers.get(name)).toBe(value);
    }
    expect(response.headers.get("x-robots-tag")).toBeNull();
  });

  it("keeps preview out of search indexes", () => {
    const response = withResponseHeaders(new Response(null), { ENVIRONMENT: "preview" });
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow, noarchive");
  });
});

describe("fetch handler", () => {
  // Static Assets in single-page mode answers any miss with the HTML shell.
  const env: WorkerEnv = {
    ENVIRONMENT: "production",
    API_BASE_URL: "https://api.textures.gg",
    ASSETS_BASE_URL: "https://assets.textures.gg",
    ASSETS: {
      fetch: async () =>
        new Response("<!doctype html>", { headers: { "content-type": "text/html" } }),
    },
    API: {
      getSitemap: async () => {
        throw new Error("catalog unavailable");
      },
      getPackOpenGraph: async () => null,
      getUserOpenGraph: async () => null,
      getModShare: async () => null,
      getSetShare: async () => null,
      getShareIcon: async () => null,
      getModDocsMeta: async () => null,
      getModDocsRawFile: async () => null,
    },
  };
  const ctx = { waitUntil: () => undefined };

  it("answers a failed sitemap with a 503 nothing caches, not the HTML shell", async () => {
    vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const response = await worker.fetch(new Request("https://textures.gg/sitemap.xml"), env, ctx);
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("retry-after")).toBe("300");
  });

  it("answers a hashed asset this deployment lacks with a 404, not the HTML shell", async () => {
    const response = await worker.fetch(
      new Request("https://textures.gg/assets/index-0ld0ld0l.js"),
      env,
      ctx
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});

describe("code mod links", () => {
  const mod: ModShare = {
    id: "tgg.ucf",
    name: "UCF",
    description: null,
    publisher: { name: "textures.gg", official: true },
    version: "1.0.0-rc.1",
    kind: "script",
    netplay: "code",
    icon: null,
  };

  it("points a mod's card at its version, so a new release gets a new card", () => {
    const og = buildModOpenGraphData(mod, "https://textures.gg", "melee");
    expect(og.image).toBe("https://textures.gg/cards/mods/tgg.ucf.png?v=1.0.0-rc.1");
    expect(og.url).toBe("https://textures.gg/games/melee/mods/tgg.ucf");
    expect(og.description).toBe("A Melee mod by textures.gg.");
    const tags = buildOgTags(og);
    expect(tags).toContain(
      '<link rel="canonical" href="https://textures.gg/games/melee/mods/tgg.ucf" />'
    );
    expect(tags).toContain('<meta name="twitter:card" content="summary_large_image" />');
  });

  it("says what kind of mod it is and whether netplay needs it on the card", () => {
    expect(modCard(mod).chips).toEqual(["Script", "Has to match in netplay"]);
    expect(modCard({ ...mod, kind: "content", netplay: "display" }).chips).toEqual([
      "Display only",
    ]);
  });

  // With code mods off for people signed out, the catalog answers null.
  const flagOff: WorkerEnv = {
    ENVIRONMENT: "production",
    API_BASE_URL: "https://api.textures.gg",
    ASSETS_BASE_URL: "https://assets.textures.gg",
    ASSETS: {
      fetch: async () =>
        new Response(
          '<html><head><meta charset="UTF-8" /><title>textures.gg</title></head></html>',
          {
            headers: { "content-type": "text/html" },
          }
        ),
    },
    API: {
      getSitemap: async () => null,
      getPackOpenGraph: async () => null,
      getUserOpenGraph: async () => null,
      getModShare: async () => null,
      getSetShare: async () => null,
      getShareIcon: async () => null,
      getModDocsMeta: async () => null,
      getModDocsRawFile: async () => null,
    },
  };

  it("has no card for a mod or set the catalog doesn't show", async () => {
    const cache = { match: async () => undefined, put: async () => undefined };
    for (const path of ["/cards/mods/tgg.ucf.png", "/cards/sets/competitive.png"]) {
      const response = await handleCard(new Request(`https://textures.gg${path}`), flagOff, cache, {
        waitUntil: () => undefined,
      });
      expect(response.status).toBe(404);
    }
  });

  it("gives crawlers a mod's tags, though its id looks like a file name", async () => {
    const response = await worker.fetch(
      new Request("https://textures.gg/games/melee/mods/tgg.ucf", {
        headers: { "user-agent": "Twitterbot/1.0" },
      }),
      { ...flagOff, API: { ...flagOff.API, getModShare: async () => mod } },
      { waitUntil: () => undefined }
    );
    const html = await response.text();
    expect(html).toContain("<title>UCF - textures.gg</title>");
    expect(html).toContain(
      '<meta property="og:image" content="https://textures.gg/cards/mods/tgg.ucf.png?v=1.0.0-rc.1" />'
    );
  });

  it("gives crawlers the plain page for a mod the catalog doesn't show", async () => {
    const response = await worker.fetch(
      new Request("https://textures.gg/games/melee/mods/tgg.ucf", {
        headers: { "user-agent": "Twitterbot/1.0" },
      }),
      flagOff,
      { waitUntil: () => undefined }
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("<title>textures.gg</title>");
  });

  it("gives crawlers Open Graph tags for /download, /guides, /faq, and /about", async () => {
    const response = await worker.fetch(
      new Request("https://textures.gg/download", {
        headers: { "user-agent": "Discordbot/2.0" },
      }),
      flagOff,
      { waitUntil: () => undefined }
    );
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("<title>Download the app - textures.gg</title>");
    expect(html).toContain('<link rel="canonical" href="https://textures.gg/download" />');

    const faq = await worker.fetch(
      new Request("https://textures.gg/faq", {
        headers: { "user-agent": "Discordbot/2.0" },
      }),
      flagOff,
      { waitUntil: () => undefined }
    );
    expect(faq.status).toBe(200);
    const faqHtml = await faq.text();
    expect(faqHtml).toContain("<title>FAQ - textures.gg</title>");
    expect(faqHtml).toContain('<link rel="canonical" href="https://textures.gg/faq" />');
  });

  it("serves llms.txt, raw markdown pages, and tgg.luau directly, and 404s when unavailable", async () => {
    const docsEnv: WorkerEnv = {
      ...flagOff,
      API: {
        ...flagOff.API,
        getModDocsRawFile: async (wanted, path) => {
          if (wanted === "latest" && path === "llms.txt") {
            return {
              contentType: "text/plain; charset=utf-8",
              cacheControl: "public, max-age=300",
              body: "# tgg-melee mod docs\n",
            };
          }
          if (wanted === "1.0" && path === "guides/hud.md") {
            return {
              contentType: "text/markdown; charset=utf-8",
              cacheControl: "public, max-age=300",
              body: "---\ntitle: Build a HUD overlay\n---\n\nHello.\n",
            };
          }
          if (wanted === "latest" && path === "tgg.luau") {
            return {
              contentType: "text/plain; charset=utf-8",
              cacheControl: "public, max-age=300",
              body: "--!strict\nreturn {}\n",
            };
          }
          return null;
        },
      },
    };
    const ctx = { waitUntil: () => undefined };

    const llms = await worker.fetch(
      new Request("https://textures.gg/docs/mods/llms.txt"),
      docsEnv,
      ctx
    );
    expect(llms.status).toBe(200);
    expect(llms.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(await llms.text()).toBe("# tgg-melee mod docs\n");

    const md = await worker.fetch(
      new Request("https://textures.gg/docs/mods/1.0/guides/hud.md"),
      docsEnv,
      ctx
    );
    expect(md.status).toBe(200);
    expect(md.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(await md.text()).toContain("Build a HUD overlay");

    const types = await worker.fetch(
      new Request("https://textures.gg/docs/mods/latest/tgg.luau"),
      docsEnv,
      ctx
    );
    expect(types.status).toBe(200);
    expect(types.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(await types.text()).toBe("--!strict\nreturn {}\n");

    const legacy = await worker.fetch(
      new Request("https://textures.gg/docs/mods/0.1/guides/hud.md"),
      docsEnv,
      ctx
    );
    expect(legacy.status).toBe(302);
    expect(legacy.headers.get("location")).toBe("/docs/mods/latest/guides/hud.md");

    const missing = await worker.fetch(
      new Request("https://textures.gg/docs/mods/1.0/guides/missing.md"),
      docsEnv,
      ctx
    );
    expect(missing.status).toBe(404);
    expect(missing.headers.get("content-type")).toBe("text/plain; charset=UTF-8");

    const off = await worker.fetch(
      new Request("https://textures.gg/docs/mods/llms.txt"),
      flagOff,
      ctx
    );
    expect(off.status).toBe(404);
  });

  it("gives crawlers per-page title, description, and latest canonical URL for mod docs", async () => {
    const docsEnv: WorkerEnv = {
      ...flagOff,
      API: {
        ...flagOff.API,
        getModDocsMeta: async (wanted, page) => {
          if (wanted === "1.0" && page === "guides/hud") {
            return {
              title: "Build a HUD overlay - Making mods - textures.gg",
              description: "Draw percent, stock count, and timers on screen.",
              canonicalPath: "/docs/mods/latest/guides/hud",
            };
          }
          return null;
        },
      },
    };
    const response = await worker.fetch(
      new Request("https://textures.gg/docs/mods/1.0/guides/hud", {
        headers: { "user-agent": "Googlebot/2.1" },
      }),
      docsEnv,
      { waitUntil: () => undefined }
    );
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("<title>Build a HUD overlay - Making mods - textures.gg</title>");
    expect(html).toContain(
      '<meta name="description" content="Draw percent, stock count, and timers on screen." />'
    );
    expect(html).toContain(
      '<link rel="canonical" href="https://textures.gg/docs/mods/latest/guides/hud" />'
    );
  });
});
