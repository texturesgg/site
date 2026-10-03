import { describe, expect, it } from "vitest";
import { parsePublicCatalogIdentifier } from "./public-catalog";

describe("public catalog RPC arguments", () => {
  it("accepts deployed catalog identifiers", () => {
    expect(parsePublicCatalogIdentifier("melee")).toBe("melee");
    expect(parsePublicCatalogIdentifier("pack-slug-123")).toBe("pack-slug-123");
  });

  it.each([undefined, null, 42, "", "x".repeat(201)])("rejects invalid identifiers", (value) => {
    expect(() => parsePublicCatalogIdentifier(value)).toThrow();
  });
});
