import { describe, expect, it } from "vitest";
import { getGeneralApiRateLimitBucket, shouldApplyGeneralApiRateLimit } from "./rate-limit";

describe("general API rate-limit policy", () => {
  it.each([
    ["OPTIONS", "/api/packs"],
    ["GET", "/"],
    ["GET", "/api/auth"],
    ["GET", "/api/auth/get-session"],
    ["GET", "/api/files"],
    ["GET", "/api/files/packs/example.dat"],
    ["GET", "/api/packs/by-id/pack-1/download"],
    ["GET", "/api/packs/by-id/pack-1/mods/mod-1/download"],
    ["POST", "/api/packs"],
    ["GET", "/api/code-mods/packages/0123.zip"],
    ["POST", "/api/code-mods"],
    ["POST", "/api/editor/reports"],
    ["POST", "/api/reports"],
    ["POST", "/api/packs/by-id/pack-1/mods/mod-1/retry"],
    ["POST", "/api/packs/by-id/pack-1/comments"],
  ])("exempts %s %s", (method, pathname) => {
    expect(shouldApplyGeneralApiRateLimit(method, pathname)).toBe(false);
  });

  it.each([
    ["GET", "/api/games"],
    ["GET", "/api/packs"],
    ["GET", "/api/packs/by-id/pack-1/comments"],
    ["POST", "/api/packs/by-id/pack-1/vote"],
    ["GET", "/api/code-mods/catalog/0123456789abcdef"],
    ["POST", "/api/code-mods/tgg.example/push-token"],
  ])("limits %s %s", (method, pathname) => {
    expect(shouldApplyGeneralApiRateLimit(method, pathname)).toBe(true);
  });

  it("partitions counters by top-level API area", () => {
    expect(getGeneralApiRateLimitBucket("/api/games/melee")).toBe("games");
    expect(getGeneralApiRateLimitBucket("/api/packs/by-id/pack-1")).toBe("packs");
    expect(getGeneralApiRateLimitBucket("/api/admin/stats")).toBe("admin");
  });
});
