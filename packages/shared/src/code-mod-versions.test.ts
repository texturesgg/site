import { expect, test } from "vitest";
import { byVersionDescending, rangeMatches, releasesWorthBuilding } from "./code-mod-versions";

test("ranges match as tgg-mod reads them", () => {
  const cases: [string, string, boolean][] = [
    ["1.2.3", "1.2.3", true],
    ["1.2.3", "1.2.4", false],
    ["1.2", "1.2.9", true],
    ["1.2", "1.3.0", false],
    ["^1.2", "1.9.0", true],
    ["^1.2", "2.0.0", false],
    ["^1.2", "1.1.9", false],
    ["^0.3", "0.3.5", true],
    ["^0.3", "0.4.0", false],
    ["~1.2", "1.2.7", true],
    ["~1.2", "1.3.0", false],
    [">=1.2", "4.0.0", true],
    ["*", "0.0.1", true],
    ["1.2.3", "1.2.3-beta", true],
    ["v1.2", "1.2.0", false],
  ];
  for (const [range, version, expected] of cases) {
    expect(rangeMatches(range, version), `${range} ${version}`).toBe(expected);
  }
});

test("versions order newest first, a pre-release before its release", () => {
  expect(["0.1.0", "0.10.0", "0.2.0-rc.1", "0.2.0"].sort(byVersionDescending)).toEqual([
    "0.10.0",
    "0.2.0",
    "0.2.0-rc.1",
    "0.1.0",
  ]);
});

test("each mod's newest release is worth building, and a set's pin outside it", () => {
  const releases = ["0.1.0", "0.1.1", "0.2.0", "1.0.0"].map((version) => ({
    mod: "me.a",
    version,
  }));
  releases.push({ mod: "me.b", version: "0.3.0" }, { mod: "me.b", version: "0.2.0" });
  const worth = (ranges: { mod: string; range: string }[]) =>
    releasesWorthBuilding(releases, ranges).map(({ mod, version }) => `${mod} ${version}`);

  expect(worth([])).toEqual(["me.a 1.0.0", "me.b 0.3.0"]);
  expect(worth([{ mod: "me.a", range: "^0.1" }])).toEqual([
    "me.a 0.1.1",
    "me.a 1.0.0",
    "me.b 0.3.0",
  ]);
  // A range the newest is in adds nothing; one nothing is in adds nothing.
  expect(
    worth([
      { mod: "me.a", range: "*" },
      { mod: "me.b", range: "^9" },
    ])
  ).toEqual(["me.a 1.0.0", "me.b 0.3.0"]);
});
