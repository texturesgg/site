import { describe, expect, it } from "vitest";
import { linkSegments } from "./Description";

describe("linkSegments", () => {
  it("links http and https URLs and leaves the rest as text", () => {
    expect(linkSegments("Get DTW: https://smashboards.com/t/1/ now")).toEqual([
      { text: "Get DTW: " },
      { text: "https://smashboards.com/t/1/", href: "https://smashboards.com/t/1/" },
      { text: " now" },
    ]);
  });

  it("keeps trailing punctuation out of the link", () => {
    expect(linkSegments("See http://a.example/x.")).toEqual([
      { text: "See " },
      { text: "http://a.example/x", href: "http://a.example/x" },
      { text: "." },
    ]);
  });

  it("never links other schemes", () => {
    expect(linkSegments("javascript:alert(1) data:text/html,x")).toEqual([
      { text: "javascript:alert(1) data:text/html,x" },
    ]);
  });
});
