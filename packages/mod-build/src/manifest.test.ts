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

describe("slippi field", () => {
  const base = { api: "tgg-melee/0", id: "me.mod", version: "1.0.0" };
  const read = (slippi: unknown) => {
    const parsed = parseManifest(JSON.stringify({ ...base, slippi }));
    if ("error" in parsed) throw new Error(parsed.error);
    return parsed.manifest;
  };

  it("reads the codes a mod reproduces, name and versions defaulting", () => {
    const manifest = read([
      { code: "0x801D45EC", name: "Preload Stadium Transformations", versions: "<3.19" },
      { code: "frozen-stadium" },
      { code: "0x801D4578", versions: ">=3.9, <3.18" },
    ]);
    expect(manifest.refusal).toBeNull();
    expect(manifest.slippi).toEqual([
      { code: "0x801D45EC", name: "Preload Stadium Transformations", versions: "<3.19" },
      { code: "frozen-stadium", name: "", versions: "*" },
      { code: "0x801D4578", name: "", versions: ">=3.9, <3.18" },
    ]);
  });

  it("fails a release whose slippi field isn't a list of codes", () => {
    expect(read({ code: "0x801D45EC" }).refusal).toContain("slippi");
    expect(read(["0x801D45EC"]).refusal).toContain("slippi");
    expect(read([{ code: "0x801d45ec" }]).refusal).toContain("upper-case");
    expect(read([{ code: "801D45EC" }]).refusal).toContain("0x801D45EC");
    expect(read([{ code: "ucf-on" }]).refusal).toContain("frozen-stadium");
    expect(read([{ code: "0x801D45EC", versions: "before 3.19" }]).refusal).toContain("versions");
    expect(read([{ code: "0x801D45EC", name: 3 }]).refusal).toContain("name");
    expect(read(Array.from({ length: 65 }, () => ({ code: "ucf-off" }))).refusal).toContain("64");
    expect(read([]).slippi).toEqual([]);
  });
});
