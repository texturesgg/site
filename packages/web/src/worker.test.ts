import { logger } from "@vgskins/logger";
import { describe, expect, it, vi } from "vitest";
import worker, {
  buildPackOpenGraphData,
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
    });

    expect(xml).toContain("https://textures.gg/games/melee");
    expect(xml).toContain("https://textures.gg/games/melee/packs/falcon-pack");
    expect(xml).toContain("https://textures.gg/users/Ciao");
    expect(xml).toContain("<lastmod>2026-08-02</lastmod>");
  });

  it("keeps a user name from breaking out of its sitemap entry", () => {
    const xml = buildSitemapXml({
      games: [],
      packs: [],
      users: [{ name: "a&b</loc><x>", updatedAt: new Date("2026-08-03T00:00:00Z") }],
    });

    expect(xml).toContain("<loc>https://textures.gg/users/a%26b%3C%2Floc%3E%3Cx%3E</loc>");
    expect(xml).not.toContain("<x>");
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
    },
  };

  it("answers a failed sitemap with a 503 nothing caches, not the HTML shell", async () => {
    vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const response = await worker.fetch(new Request("https://textures.gg/sitemap.xml"), env);
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("retry-after")).toBe("300");
  });

  it("answers a hashed asset this deployment lacks with a 404, not the HTML shell", async () => {
    const response = await worker.fetch(
      new Request("https://textures.gg/assets/index-0ld0ld0l.js"),
      env
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
