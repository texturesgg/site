import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  escapeLikePattern,
  likeContains,
  parsePagination,
  sanitizeSearch,
  validateFilePath,
} from "./validation";

describe("artifact path validation", () => {
  it("rejects unsupported model artifact paths", () => {
    expect(validateFilePath(`glb/2/${"a".repeat(64)}.glb`)).toBeNull();
    expect(validateFilePath("packs/pack-1/mods/mod-1/model.glb")).toBeNull();
  });

  it("rejects keys outside the allowed prefixes", () => {
    expect(validateFilePath("secrets/key.pem")).toBeNull();
    expect(validateFilePath("/packs/1/mod.dat")).toBeNull();
  });

  it("rejects traversal-shaped keys instead of rewriting them", () => {
    expect(validateFilePath("packs/../secrets/key.pem")).toBeNull();
    // Nested sequence that survived the old single-pass strip
    expect(validateFilePath("packs/....//x.dat")).toBeNull();
    expect(validateFilePath("packs//x.dat")).toBeNull();
    expect(validateFilePath("packs/./x.dat")).toBeNull();
  });
});

describe("pagination parsing", () => {
  it("applies defaults for missing values", () => {
    expect(parsePagination({})).toEqual({ page: 1, pageSize: 20, offset: 0 });
  });

  it("clamps page and pageSize to upper bounds", () => {
    expect(parsePagination({ page: "999999", pageSize: "5000" })).toEqual({
      page: 10000,
      pageSize: 100,
      offset: 9999 * 100,
    });
  });

  it("treats zero as missing and falls back to defaults", () => {
    expect(parsePagination({ page: "0", pageSize: "0" })).toEqual({
      page: 1,
      pageSize: 20,
      offset: 0,
    });
  });

  it("falls back to defaults on non-numeric input", () => {
    expect(parsePagination({ page: "abc", pageSize: "xyz" })).toEqual({
      page: 1,
      pageSize: 20,
      offset: 0,
    });
  });

  it("computes offsets from the parsed page", () => {
    expect(parsePagination({ page: "3", pageSize: "25" })).toEqual({
      page: 3,
      pageSize: 25,
      offset: 50,
    });
  });
});

describe("search sanitization", () => {
  it("trims and enforces the length limit without escaping", () => {
    expect(sanitizeSearch("  falco  ")).toBe("falco");
    expect(sanitizeSearch("a".repeat(200))).toBe("a".repeat(100));
    expect(sanitizeSearch("50%_off\\sale")).toBe("50%_off\\sale");
  });

  it("returns undefined for empty input", () => {
    expect(sanitizeSearch(undefined)).toBeUndefined();
    expect(sanitizeSearch("   ")).toBeUndefined();
  });
});

describe("LIKE escaping", () => {
  it("escapes backslash before wildcards", () => {
    expect(escapeLikePattern("50%")).toBe("50\\%");
    expect(escapeLikePattern("a_b")).toBe("a\\_b");
    expect(escapeLikePattern("a\\%b")).toBe("a\\\\\\%b");
  });

  it("emits a LIKE condition with an ESCAPE clause and neutralized wildcards", () => {
    const dialect = new SQLiteSyncDialect();
    const query = dialect.sqlToQuery(likeContains(sql.raw("title"), "50%_off"));
    expect(query.sql).toBe("title LIKE ? ESCAPE '\\'");
    expect(query.params).toEqual(["%50\\%\\_off%"]);
  });
});
