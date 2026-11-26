import { expect, it } from "vitest";
import {
  docsPagePath,
  resolveDocsImage,
  resolveDocsLink,
  stripDocsFrontmatter,
} from "./mod-docs-links";

const release = {
  pages: {
    index: { title: "Making mods", label: "Overview", description: "Intro.", headings: [] },
    "start/quickstart": {
      title: "Your first mod",
      label: "Quickstart",
      description: "Start.",
      headings: [],
    },
    "guides/hud": { title: "HUD overlays", description: "Draw.", headings: [] },
    "guides/screens": { title: "Menus and screens", description: "Screens.", headings: [] },
    "concepts/sim-and-view": { title: "Sim and view", description: "Scripts.", headings: [] },
    "native/hooks": { title: "Hooks", description: "Hooks.", headings: [] },
  },
  headers: ["tgg/mod.h", "tgg/draw.h"],
};

it("resolves nested docs links, headers, same-site links, and ignores repo-only paths", () => {
  const fromHud = (href: string) => resolveDocsLink(href, "main", "guides/hud", release);
  expect(fromHud("screens.md")).toEqual({ to: "site", href: "/docs/mods/main/guides/screens" });
  expect(fromHud("../concepts/sim-and-view.md#state")).toEqual({
    to: "site",
    href: "/docs/mods/main/concepts/sim-and-view#state",
  });
  expect(fromHud("../index.md")).toEqual({ to: "site", href: "/docs/mods/main" });
  expect(fromHud("#shapes")).toEqual({ to: "site", href: "/docs/mods/main/guides/hud#shapes" });
  expect(fromHud("../../mods/include/tgg/draw.h")).toEqual({
    to: "site",
    href: "/docs/mods/main/api/draw",
  });
  expect(fromHud("../../mods/api/tgg.luau")).toEqual({
    to: "external",
    href: expect.stringMatching(/\/api\/docs\/mods\/main\/tgg\.luau$/),
  });
  expect(fromHud("https://textures.gg/guides")).toEqual({ to: "site", href: "/guides" });
  expect(fromHud("https://example.com/a")).toEqual({
    to: "external",
    href: "https://example.com/a",
  });
  expect(fromHud("missing.md")).toBeNull();
  expect(fromHud("../../mods/examples")).toBeNull();
  expect(fromHud("javascript:alert(1)")).toBeNull();
  expect(docsPagePath("1.0", "index")).toBe("/docs/mods/1.0");
  expect(docsPagePath("1.0", "guides/hud")).toBe("/docs/mods/1.0/guides/hud");
});

it("resolves relative docs images under docs/images/ and rejects everything else", () => {
  expect(resolveDocsImage("../images/hud-overlay.webp", "main", "guides/hud")).toMatch(
    /\/api\/docs\/mods\/main\/images\/hud-overlay\.webp$/
  );
  expect(resolveDocsImage("images/hud-overlay.webp", "1.0", "index")).toMatch(
    /\/api\/docs\/mods\/1\.0\/images\/hud-overlay\.webp$/
  );
  expect(resolveDocsImage("https://evil.example/a.png", "main", "guides/hud")).toBeNull();
  expect(resolveDocsImage("../images/bad.svg", "main", "guides/hud")).toBeNull();
  expect(resolveDocsImage("../../secret.png", "main", "guides/hud")).toBeNull();
});

it("strips YAML frontmatter and optional leading H1", () => {
  expect(
    stripDocsFrontmatter("---\ntitle: Hooks\ndescription: Desc.\n---\n\n# Hooks\n\nBody text.")
  ).toBe("Body text.");
  expect(
    stripDocsFrontmatter("---\ntitle: Quickstart\ndescription: Desc.\n---\n\nLead paragraph.")
  ).toBe("Lead paragraph.");
});
