import { describe, expect, it } from "vitest";
import { type LabelSet, labelFor, parseNames } from "./meet-queue-label";

const competitive: LabelSet = {
  title: "Competitive",
  mods: [
    { mod: "tgg.netplay", range: "^0.10", counted: true },
    { mod: "tgg.direct-connect", range: "^0.6", counted: true },
    { mod: "tgg.ucf", range: "^1.0", counted: true },
    { mod: "tgg.legal-stages", range: "^1.0", counted: false },
  ],
};
const names = new Map([
  ["me.volleyball", "Volleyball"],
  ["tgg.ucf", "UCF"],
]);
const base = "tgg.netplay 0.10.0, tgg.direct-connect 0.6.0, tgg.ucf 1.0.0";

describe("queue names", () => {
  it("reads tgg_mod_set_names", () => {
    expect(parseNames("a 1.0.0, b 2.1.0")).toEqual([
      { id: "a", version: "1.0.0" },
      { id: "b", version: "2.1.0" },
    ]);
    expect(parseNames("")).toEqual([]);
  });

  it("names a set by its gameplay mods, display mods or not", () => {
    expect(labelFor(parseNames(base), [competitive], names)).toBe("Competitive");
  });

  it("adds what isn't in the set", () => {
    expect(labelFor(parseNames(`${base}, me.volleyball 1.0.0`), [competitive], names)).toBe(
      "Competitive + Volleyball"
    );
  });

  it("isn't the set when a gameplay mod of it is missing or another version", () => {
    expect(
      labelFor(parseNames("tgg.netplay 0.10.0, tgg.direct-connect 0.6.0"), [competitive], names)
    ).toBe("No gameplay mods");
    expect(labelFor(parseNames(`${base.replace("1.0.0", "2.0.0")}`), [competitive], names)).toBe(
      "UCF"
    );
    expect(
      labelFor(
        parseNames("tgg.netplay 0.10.0, tgg.direct-connect 0.6.0, me.volleyball 1.0.0"),
        [competitive],
        names
      )
    ).toBe("Volleyball");
  });
});
