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
