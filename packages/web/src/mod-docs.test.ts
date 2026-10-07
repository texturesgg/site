import { expect, it } from "vitest";
import { modDocsLocation } from "./mod-docs";

it("sends a docs page to the newest release of its minor, or of all for latest", () => {
  const releases = ["0.1.0", "0.1.2", "0.1.10", "0.2.0", "0.10.1"];
  const docs = "https://github.com/texturesgg/tgg-melee/blob";
  expect(modDocsLocation("/docs/mods/0.1/hooks", releases)).toBe(`${docs}/v0.1.10/docs/hooks.md`);
  expect(modDocsLocation("/docs/mods/0.2", releases)).toBe(`${docs}/v0.2.0/docs/README.md`);
  expect(modDocsLocation("/docs/mods/latest/writing-mods", releases)).toBe(
    `${docs}/v0.10.1/docs/writing-mods.md`
  );
  expect(modDocsLocation("/docs/mods/0.3/hooks", releases)).toBeNull();
  expect(modDocsLocation("/docs/mods/0.1/..%2Fsecrets", releases)).toBeNull();
});

it("uses a minor's newest prerelease only until it has a release", () => {
  const docs = "https://github.com/texturesgg/tgg-melee/blob";
  const before = ["0.1.0-rc.2", "0.1.0-rc.10", "0.1.0-rc.9"];
  expect(modDocsLocation("/docs/mods/0.1/README", before)).toBe(
    `${docs}/v0.1.0-rc.10/docs/README.md`
  );
  const after = [...before, "0.1.0", "0.1.1-rc.1"];
  expect(modDocsLocation("/docs/mods/latest", after)).toBe(`${docs}/v0.1.0/docs/README.md`);
});
