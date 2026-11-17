import { describe, expect, it } from "vitest";
import { type LabelSet, parseNames, queueFor } from "./meet-queue-label";

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
/** The name a queue with these mods gets beside the Competitive set. */
const labelFor = (list: string) => queueFor(parseNames(list), [competitive], names).label;

describe("queue names", () => {
  it("reads tgg_mod_set_names", () => {
    expect(parseNames("a 1.0.0, b 2.1.0")).toEqual([
      { id: "a", version: "1.0.0" },
      { id: "b", version: "2.1.0" },
    ]);
    expect(parseNames("")).toEqual([]);
  });

  it("names a set by its gameplay mods, display mods or not", () => {
    expect(labelFor(base)).toBe("Competitive");
  });

  it("adds what isn't in the set", () => {
    expect(labelFor(`${base}, me.volleyball 1.0.0`)).toBe("Competitive + Volleyball");
  });

  it("isn't the set when a gameplay mod of it is missing or another version", () => {
    expect(labelFor("tgg.netplay 0.10.0, tgg.direct-connect 0.6.0")).toBe("No gameplay mods");
    expect(labelFor(`${base.replace("1.0.0", "2.0.0")}`)).toBe("UCF");
    expect(labelFor("tgg.netplay 0.10.0, tgg.direct-connect 0.6.0, me.volleyball 1.0.0")).toBe(
      "Volleyball"
    );
  });

  it("never names a queue after a set of online plumbing alone", () => {
    const online: LabelSet = {
      title: "Online play",
      mods: ["tgg.netplay", "tgg.direct-connect", "tgg.http", "tgg.unlocks"].map((mod) => ({
        mod,
        range: "*",
        counted: true,
      })),
    };
    const profile = parseNames(`${base}, tgg.http 1.0.0, tgg.unlocks 2.0.0`);
    expect(queueFor(profile, [online, competitive], names).label).toBe("Competitive");
    expect(queueFor(parseNames("tgg.netplay 0.10.0"), [online], names).label).toBe(
      "No gameplay mods"
    );
  });

  it("is a standing queue only when the set is one and nothing is added", () => {
    const queue: LabelSet = { ...competitive, name: "competitive", queue: true };
    expect(queueFor(parseNames(base), [queue], names)).toEqual({
      label: "Competitive",
      set: "competitive",
    });
    expect(queueFor(parseNames(`${base}, me.volleyball 1.0.0`), [queue], names).set).toBeNull();
    expect(queueFor(parseNames(base), [{ ...queue, queue: false }], names).set).toBeNull();
  });
});
