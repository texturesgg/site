import { expect, it } from "vitest";
import { headingSlug } from "@/ui/patterns/Markdown";
import { docsPageLabel, resolveDocsLink } from "./mod-docs-links";

// The docs' links are written for the repository; tgg links the site with
// anchors from the headings, so both have to land on the right place here.
const release = { pages: ["README", "hooks", "scripts"], headers: ["tgg/mod.h"] };
const resolve = (href: string) => resolveDocsLink(href, "latest", "hooks", release);

it("sends docs links to their page here and leaves the rest", () => {
  expect(resolve("scripts.md#when-to-write-c")).toEqual({
    to: "site",
    href: "/docs/mods/latest/scripts#when-to-write-c",
  });
  expect(resolve("README.md")).toEqual({ to: "site", href: "/docs/mods/latest" });
  expect(resolve("#statics")).toEqual({ to: "site", href: "/docs/mods/latest/hooks#statics" });
  expect(resolve("../mods/include/tgg/mod.h")).toEqual({
    to: "site",
    href: "/docs/mods/latest/api/mod",
  });
  expect(resolve("https://example.com/a")).toEqual({
    to: "external",
    href: "https://example.com/a",
  });
  expect(resolve("missing.md")).toBeNull();
  expect(resolve("../mods/examples")).toBeNull();
  expect(resolve("javascript:alert(1)")).toBeNull();
});

it("makes heading anchors the way GitHub does", () => {
  expect(headingSlug("When to write C")).toBe("when-to-write-c");
  expect(headingSlug("Before, after and replace")).toBe("before-after-and-replace");
  expect(headingSlug("`TGG_STATE` and rollback")).toBe("tgg_state-and-rollback");
});

it("gives Luau and C getting-started pages distinct sidebar labels", () => {
  expect(docsPageLabel("README")).toBe("Overview");
  expect(docsPageLabel("scripts-getting-started")).toBe("Getting started");
  expect(docsPageLabel("getting-started")).toBe("Getting started (C)");
  expect(docsPageLabel("files-and-assets")).toBe("Files and assets");
});
