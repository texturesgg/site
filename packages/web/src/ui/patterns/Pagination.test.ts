import { describe, expect, it } from "vitest";
import { pageWindow } from "./Pagination";

describe("pageWindow", () => {
  it("lists every page when there are few", () => {
    expect(pageWindow(2, 3)).toEqual([1, 2, 3]);
  });

  it("keeps the ends and the current page's neighbors, with gaps between", () => {
    expect(pageWindow(6, 12)).toEqual([1, "gap", 5, 6, 7, "gap", 12]);
  });

  it("leaves no gap where the window meets an end", () => {
    expect(pageWindow(1, 12)).toEqual([1, 2, "gap", 12]);
    expect(pageWindow(3, 12)).toEqual([1, 2, 3, 4, "gap", 12]);
  });
});
