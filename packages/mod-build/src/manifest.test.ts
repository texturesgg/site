import { describe, expect, it } from "vitest";
import { parseManifest } from "./manifest";

describe("parseManifest", () => {
  it("fails a release whose manifest declares netplay", () => {
    const parsed = parseManifest(
      JSON.stringify({ api: "tgg-melee/0", id: "me.mod", version: "1.0.0", netplay: "cosmetic" })
    );
    expect(parsed).toMatchObject({
      manifest: { id: "me.mod", version: "1.0.0", refusal: expect.stringContaining("netplay") },
    });
  });
});

describe("listing fields", () => {
  const base = { api: "tgg-melee/0", id: "me.mod", version: "1.0.0" };
  const refusal = (fields: Record<string, unknown>) => {
    const parsed = parseManifest(JSON.stringify({ ...base, ...fields }));
    if ("error" in parsed) throw new Error(parsed.error);
    return parsed.manifest.refusal;
  };

  it("reads an icon, screenshots, tags and a homepage", () => {
    const parsed = parseManifest(
      JSON.stringify({
        ...base,
        icon: "icon.png",
        screenshots: ["shots/menu.png", "shots/match.PNG"],
        tags: ["competitive", "quality-of-life"],
        homepage: "https://example.com/mod",
      })
    );
    expect(parsed).toEqual({
      manifest: expect.objectContaining({
        icon: "icon.png",
        screenshots: ["shots/menu.png", "shots/match.PNG"],
        tags: ["competitive", "quality-of-life"],
        homepage: "https://example.com/mod",
        refusal: null,
      }),
    });
  });

  it("fails a release with listing fields tgg would refuse", () => {
    expect(refusal({ icon: "icon.jpg" })).toContain("icon");
    expect(refusal({ icon: "../icon.png" })).toContain("icon");
    expect(refusal({ screenshots: ["a.png", "/b.png"] })).toContain("screenshots");
    expect(refusal({ screenshots: Array.from({ length: 9 }, (_, i) => `${i}.png`) })).toContain(
      "screenshots"
    );
    expect(refusal({ tags: ["speedrun"] })).toContain("tags");
    expect(refusal({ tags: ["visual", "visual"] })).toContain("tags");
    expect(refusal({ homepage: "javascript:alert(1)" })).toContain("homepage");
    expect(refusal({})).toBeNull();
  });
});
