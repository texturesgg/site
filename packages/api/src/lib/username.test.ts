import { validateUsername } from "@vgskins/shared";
import { describe, expect, it } from "vitest";
import { uniqueUsername, usernameCandidate } from "./username";

describe("usernameCandidate", () => {
  it.each([
    ["Nathan", "Nathan"],
    ["Nathan Smith", "Nathan-Smith"],
    ["José Ñúñez", "Jose-Nunez"],
    ["john.doe+melee", "john-doe-melee"],
    ["  --weird__ name!!  ", "weird__-name"],
    ["a very long display name indeed", "a-very-long-display"],
    ["Al", "Al-user"],
    ["admin", "admin-user"],
    ["日本語", "user"],
    ["", "user"],
  ])("derives a valid username from %j", (raw, expected) => {
    const candidate = usernameCandidate(raw);
    expect(candidate).toBe(expected);
    expect(validateUsername(candidate).valid).toBe(true);
  });
});

describe("uniqueUsername", () => {
  const takenFrom = (names: string[]) => async (name: string) => names.includes(name);

  it("keeps the candidate when it is free", async () => {
    await expect(uniqueUsername("Nathan", takenFrom([]))).resolves.toBe("Nathan");
  });

  it("adds a suffix when the candidate is taken", async () => {
    const suffixes = ["1111", "2222"];
    const name = await uniqueUsername("Nathan", takenFrom(["Nathan", "Nathan-1111"]), () =>
      suffixes.shift()!
    );
    expect(name).toBe("Nathan-2222");
  });

  it("keeps suffixed names within the length limit", async () => {
    const name = await uniqueUsername(
      "a very long display name indeed",
      takenFrom(["a-very-long-display"]),
      () => "4821"
    );
    expect(name).toBe("a-very-long-dis-4821");
    expect(validateUsername(name).valid).toBe(true);
  });

  it("always suffixes the generic fallback", async () => {
    const name = await uniqueUsername("日本語", takenFrom([]), () => "4821");
    expect(name).toBe("user-4821");
  });

  it("falls back to a random name when every suffix collides", async () => {
    const name = await uniqueUsername(
      "Nathan",
      async () => true,
      () => "1111"
    );
    expect(name).toMatch(/^user-[0-9a-f]{8}$/);
  });
});
