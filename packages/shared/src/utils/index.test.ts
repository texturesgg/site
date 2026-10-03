import { describe, expect, test } from "vitest";
import { displayName, validateUsername } from "./index";

describe("username validation", () => {
  test("returns errors only for rejected names", () => {
    expect(validateUsername("valid_name")).toEqual({ valid: true });
    expect(validateUsername("ab")).toEqual({
      valid: false,
      error: "Username must be at least 3 characters",
    });
  });
});

describe("displayName", () => {
  test("drops an imported account's 8-digit id suffix", () => {
    expect(displayName("Vancity_Primal-60399461")).toBe("Vancity_Primal");
  });

  test("leaves other names alone", () => {
    expect(displayName("fox-main")).toBe("fox-main");
    expect(displayName("user-1234")).toBe("user-1234");
    expect(displayName("abc-123456789")).toBe("abc-123456789");
  });

  test("the suffix form is reserved for imported accounts", () => {
    expect(validateUsername("fox-12345678").valid).toBe(false);
  });
});
