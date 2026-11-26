import { expect, it } from "vitest";
import {
  docsCandidates,
  docsMinor,
  docsMinors,
  docsPageLabel,
  docsPrevNext,
  docsResolveRedirect,
  ModDocsIndex,
  ModDocsPage,
  ModDocsWanted,
} from "./mod-docs";

it("tries a minor's releases newest first, every release for latest, and main directly", () => {
  const releases = ["0.1.0", "1.0.2", "1.0.10", "1.1.0", "1.10.1", "junk"];
  expect(docsCandidates("1.0", releases)).toEqual(["1.0.10", "1.0.2"]);
  expect(docsCandidates("latest", releases)[0]).toBe("1.10.1");
  expect(docsCandidates("main", releases)).toEqual(["main"]);
  expect(docsCandidates("2.0", releases)).toEqual([]);
  expect(docsMinor("main")).toBe("main");
  expect(docsMinor("1.0.0-rc.1")).toBe("1.0");
});

it("puts a minor's prereleases after its releases", () => {
  const before = ["1.0.0-rc.2", "1.0.0-rc.10", "1.0.0-rc.9"];
  expect(docsCandidates("1.0", before)).toEqual(["1.0.0-rc.10", "1.0.0-rc.9", "1.0.0-rc.2"]);
  const after = [...before, "1.0.0", "1.0.1-rc.1"];
  expect(docsCandidates("latest", after).slice(0, 2)).toEqual(["1.0.0", "1.0.1-rc.1"]);
});

it("lists each minor once, newest first", () => {
  expect(docsMinors(["1.0.0-rc.12", "1.0.0-rc.11", "1.10.0", "1.2.0"])).toEqual([
    "1.10",
    "1.2",
    "1.0",
  ]);
});

it("accepts nested page paths and rejects traversal or format 1 indices", () => {
  expect(ModDocsPage.safeParse("start/quickstart").success).toBe(true);
  expect(ModDocsPage.safeParse("index").success).toBe(true);
  expect(ModDocsPage.safeParse("../secret").success).toBe(false);
  expect(ModDocsPage.safeParse("/start/quickstart").success).toBe(false);
  expect(ModDocsWanted.safeParse("main").success).toBe(true);
  expect(ModDocsWanted.safeParse("1.0").success).toBe(true);
  expect(ModDocsWanted.safeParse("v1").success).toBe(false);
  expect(
    ModDocsIndex.safeParse({
      format: 1,
      version: "0.1.0-rc.12",
      pages: ["README"],
      headers: [],
    }).success
  ).toBe(false);
});

it("computes prev/next separately for standard and advanced tracks and resolves redirects", () => {
  const nav = [
    { title: "Start", pages: ["start/quickstart"] },
    { title: "Guides", pages: ["guides/hud", "guides/screens"] },
    { title: "Native C", advanced: true, pages: ["native/quickstart", "native/hooks"] },
  ];
  expect(docsPrevNext("start/quickstart", nav)).toEqual({ prev: null, next: "guides/hud" });
  expect(docsPrevNext("guides/screens", nav)).toEqual({ prev: "guides/hud", next: null });
  expect(docsPrevNext("native/quickstart", nav)).toEqual({ prev: null, next: "native/hooks" });

  const redirects = {
    scripts: "concepts/sim-and-view",
    "scripts#when-to-write-c": "native/index#when-to-go-native",
  };
  expect(docsResolveRedirect(redirects, "scripts", "when-to-write-c")).toEqual({
    page: "native/index",
    hash: "when-to-go-native",
  });
  expect(docsResolveRedirect(redirects, "scripts", "state")).toEqual({
    page: "concepts/sim-and-view",
    hash: "state",
  });
  expect(docsResolveRedirect(redirects, "guides/hud")).toBeNull();

  expect(
    docsPageLabel("start/quickstart", {
      "start/quickstart": {
        title: "Your first mod",
        label: "Quickstart",
        description: "Desc",
        headings: [],
      },
    })
  ).toBe("Quickstart");
});
