import { describe, expect, it } from "vitest";
import {
  getMeleeAnimationReferenceAsset,
  MELEE_ANIMATION_REFERENCE_ASSETS,
  MELEE_ANIMATION_REFERENCE_CATALOG,
} from "./melee-animation-reference";

describe("immutable Melee animation reference catalog", () => {
  it("admits only exact published identities, never arbitrary hashes or path aliases", () => {
    const asset = MELEE_ANIMATION_REFERENCE_ASSETS[0];
    expect(getMeleeAnimationReferenceAsset(asset.key)).toBe(asset);
    for (const key of [
      `reference/melee/gale01-r2/${"0".repeat(64)}.dat`,
      `${asset.key}?raw`,
      `/${asset.key}`,
      asset.key.replace(".dat", ".DAT"),
      asset.key.replace("/gale01-r2/", "/gale01-r2/../gale01-r2/"),
      "__proto__",
      "constructor",
      "toString",
    ]) {
      expect(getMeleeAnimationReferenceAsset(key)).toBeUndefined();
    }
  });

  it("retains separate internal roster identities and only source-declared asset references", () => {
    const catalog = MELEE_ANIMATION_REFERENCE_CATALOG;
    for (const asset of catalog.assets) {
      expect(asset.key).toBe(`reference/melee/gale01-r2/${asset.sha256}.dat`);
      expect(asset.byteLength).toBeGreaterThan(0);
    }
    expect(catalog.fighters.map((fighter) => fighter.fighterKind)).toEqual(
      Array.from({ length: 27 }, (_, index) => index)
    );
    for (const fighter of catalog.fighters) {
      expect(getMeleeAnimationReferenceAsset(fighter.fighterKey)).toBeDefined();
      expect(getMeleeAnimationReferenceAsset(fighter.animationsKey)).toBeDefined();
    }
    expect(new Set(catalog.assets.map((asset) => asset.sha256)).size).toBe(catalog.assets.length);
  });
});
