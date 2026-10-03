import { describe, expect, it } from "vitest";
import { orderModelPreviewMods, selectPreferredModelMod } from "./model-preview";

const unorderedMods = [
  { id: "red", fileName: "PlFcRe.dat", slot: { sortOrder: 1 } },
  { id: "neutral", fileName: "PlFcNr.dat", slot: { sortOrder: 0 } },
  { id: "missing", fileName: "notes.txt", slot: { sortOrder: -1 } },
  { id: "blue", fileName: "PlFcBu.dat", slot: { sortOrder: 2 } },
];

describe("orderModelPreviewMods", () => {
  it("orders every previewable DAT by canonical slot order", () => {
    expect(orderModelPreviewMods(unorderedMods).map((mod) => mod.id)).toEqual([
      "neutral",
      "red",
      "blue",
    ]);
  });

  it("preserves stable relation order for missing and equal slot metadata", () => {
    const mods = [
      { id: "equal-first", fileName: "first.dat", slot: { sortOrder: 2 } },
      { id: "equal-second", fileName: "second.DAT", slot: { sortOrder: 2 } },
      { id: "missing-first", fileName: "third.dat", slot: null },
      { id: "missing-second", fileName: "fourth.dat", slot: null },
    ];
    expect(orderModelPreviewMods(mods).map((mod) => mod.id)).toEqual([
      "equal-first",
      "equal-second",
      "missing-first",
      "missing-second",
    ]);
    expect(mods.map((mod) => mod.id)).toEqual([
      "equal-first",
      "equal-second",
      "missing-first",
      "missing-second",
    ]);
  });
});

describe("selectPreferredModelMod", () => {
  it("selects the canonical lowest-order DAT slot", () => {
    expect(selectPreferredModelMod(unorderedMods)?.id).toBe("neutral");
  });
});
