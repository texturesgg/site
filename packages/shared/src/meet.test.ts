import { describe, expect, it } from "vitest";
import { normalizeRoomCode } from "./meet";

describe("room codes", () => {
  it("reads codes the way people type them", () => {
    expect(normalizeRoomCode(" ab-cd ")).toBe("ABCD");
    expect(normalizeRoomCode("ABCO")).toBeNull(); // O, I and L aren't in codes
    expect(normalizeRoomCode("AB2D")).toBeNull(); // letters only
    expect(normalizeRoomCode("ABC")).toBeNull();
    expect(normalizeRoomCode("ABCDE")).toBeNull();
  });
});
