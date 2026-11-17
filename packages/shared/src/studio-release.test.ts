import { expect, it } from "vitest";
import { StudioRelease } from "./studio-release";

// The release workflow writes this file and the download page trusts only
// what parses, so the sample in docs/STUDIO_RELEASES.md has to parse.
it("reads a full release, and the old version-only file as nothing to download", () => {
  const release = StudioRelease.parse({
    version: "0.3.0",
    released: "2026-12-01",
    notes_url: "https://github.com/texturesgg/tgg-studio/releases/tag/v0.3.0",
    assets: {
      windows: [
        {
          kind: "Installer",
          url: "https://github.com/texturesgg/tgg-studio/releases/download/v0.3.0/setup.exe",
          size: 52_428_800,
          sha256: "a".repeat(64),
          min_os: "Windows 10 or later, 64-bit",
        },
        {
          kind: "Zip",
          url: "https://github.com/texturesgg/tgg-studio/releases/download/v0.3.0/app.zip",
          size: 50_000_000,
        },
      ],
    },
  });
  expect(release.assets.windows?.map((asset) => asset.kind)).toEqual(["Installer", "Zip"]);
  expect(release.assets.macos).toBeUndefined();
  expect(StudioRelease.parse({ version: "0.2.0" }).assets).toEqual({});
});

it("refuses links that aren't https", () => {
  const asset = { kind: "Zip", url: "javascript:alert(1)", size: 1 };
  expect(StudioRelease.safeParse({ version: "1", assets: { linux: [asset] } }).success).toBe(false);
  const http = { ...asset, url: "http://example.com/a.zip" };
  expect(StudioRelease.safeParse({ version: "1", assets: { linux: [http] } }).success).toBe(false);
});
