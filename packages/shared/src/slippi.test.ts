import { describe, expect, it } from "vitest";
import { isSlippiCode, isSlippiVersions, SLIPPI_DATA } from "./slippi";

describe("the registry's Slippi data", () => {
  it("names each code once, in the mapping's syntax", () => {
    const entries = [...SLIPPI_DATA.game, ...SLIPPI_DATA.minor, ...SLIPPI_DATA.ignore];
    for (const entry of entries) {
      expect(isSlippiCode(entry.code), entry.code).toBe(true);
      for (const stage of entry.stages ?? []) expect(Number.isInteger(stage)).toBe(true);
      expect(isSlippiVersions(entry.versions), entry.versions).toBe(true);
      expect(entry.why, entry.code).not.toBe("");
    }
    const keys = entries.map((entry) => `${entry.code} ${entry.versions}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("isSlippiVersions", () => {
  it("reads semver requirements", () => {
    for (const text of ["*", "<3.19", ">=3.9, <3.17", "3.18", "=3.18.0", "^3", "~3.16"]) {
      expect(isSlippiVersions(text), text).toBe(true);
    }
    for (const text of ["", "3.x", "< 3.19 || > 4", "latest", ">=3.9,"]) {
      expect(isSlippiVersions(text), text).toBe(false);
    }
  });
});
