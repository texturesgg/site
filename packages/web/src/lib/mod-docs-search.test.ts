import type { ModDocsSearchIndex } from "@vgskins/shared/mod-docs";
import { expect, it } from "vitest";
import { createDocsSearchEngine } from "./mod-docs-search";

const INDEX: ModDocsSearchIndex = {
  format: 2,
  version: "1.0.0",
  records: [
    {
      id: "s:reference/fighter#set_percent",
      kind: "symbol",
      symbolKind: "method",
      page: "reference/fighter",
      anchor: "set_percent",
      section: "Reference",
      title: "fighter:set_percent",
      pageTitle: "Fighter",
      cName: "tgg_fighter_set_percent",
      signature: "fighter:set_percent(percent: number): ()",
      text: "Sets the fighter's percent, 0 to 999.",
    },
    {
      id: "s:reference/fighter#percent",
      kind: "symbol",
      symbolKind: "property",
      page: "reference/fighter",
      anchor: "percent",
      section: "Reference",
      title: "fighter.percent",
      pageTitle: "Fighter",
      cName: "tgg_fighter_percent",
      signature: "fighter.percent: number",
      text: "Its damage percent.",
    },
    {
      id: "s:reference/constants#tggaction:tgg.action.FALL",
      kind: "symbol",
      symbolKind: "constant",
      page: "reference/constants",
      anchor: "tggaction",
      section: "Reference",
      title: "tgg.action.FALL",
      pageTitle: "Constants",
      cName: "TGG_ACTION_FALL",
      signature: "tgg.action.FALL = 29",
      text: "Airborne falling action state.",
    },
    {
      id: "p:guides/hud",
      kind: "page",
      page: "guides/hud",
      section: "Guides",
      title: "HUD overlays",
      pageTitle: "HUD overlays",
      text: "Draw text, shapes, pictures, and world-space markers over a match.",
    },
    {
      id: "h:guides/hud#coordinates",
      kind: "heading",
      page: "guides/hud",
      anchor: "coordinates",
      section: "Guides",
      title: "Coordinates",
      pageTitle: "HUD overlays",
      text: "All draw calls use a 640 by 480 virtual screen.",
    },
  ],
};

it("matches both Luau and C symbol names and ranks API symbols before headings", () => {
  const engine = createDocsSearchEngine(INDEX);

  const byC = engine.search("tgg_fighter_set_percent");
  expect(byC[0]?.label).toBe("API symbols");
  expect(byC[0]?.items[0]?.title).toBe("fighter:set_percent");
  expect(byC[0]?.items[0]?.signature).toBe("fighter:set_percent(percent: number): ()");

  const byLuau = engine.search("set_percent");
  expect(byLuau[0]?.label).toBe("API symbols");
  expect(byLuau[0]?.items[0]?.title).toBe("fighter:set_percent");

  const byConst = engine.search("TGG_ACTION_FALL");
  expect(byConst[0]?.items[0]?.title).toBe("tgg.action.FALL");
});

it("groups non-symbol hits by section and handles empty queries", () => {
  const engine = createDocsSearchEngine(INDEX);
  expect(engine.search("   ")).toEqual([]);

  const hud = engine.search("640 virtual screen");
  expect(
    hud.some((g) => g.label === "Guides" && g.items.some((i) => i.anchor === "coordinates"))
  ).toBe(true);
});
