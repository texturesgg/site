import { describe, expect, it } from "vitest";
import { type AuditVote, COMPETITION, competitionAuditFlags, entryIneligible } from "./competition";

const opens = Date.parse(COMPETITION.opens);
const day = 24 * 60 * 60 * 1000;
const minute = 60 * 1000;

describe("the competition", () => {
  it("takes mods first released on or after Dec 1, and never official ones", () => {
    const mod = { official: false, deleted: false, listed: true, firstReleaseAt: opens };
    expect(entryIneligible(mod)).toBeNull();
    expect(entryIneligible({ ...mod, firstReleaseAt: opens - 1 })).toBe(
      "Only mods first released on or after Dec 1 can enter."
    );
    expect(entryIneligible({ ...mod, official: true })).toBe("Official mods aren't entries.");
    expect(entryIneligible({ ...mod, listed: false })).toBe(
      "It can be entered once a release is approved."
    );
  });

  it("flags new accounts, bursts of them, and accounts sharing an IP", () => {
    const old = opens - 365 * day;
    const at = opens + 5 * day;
    const vote = (id: string, overrides: Partial<AuditVote>): AuditVote => ({
      id,
      modId: "a",
      userId: id,
      ipHash: id,
      accountCreatedAt: old,
      createdAt: at,
      ...overrides,
    });
    const burst = ["b1", "b2", "b3", "b4", "b5"].map((id, i) =>
      vote(id, { accountCreatedAt: at - day, createdAt: at + i * minute })
    );
    const flags = competitionAuditFlags([
      vote("old", {}),
      vote("fresh", { modId: "b", accountCreatedAt: at - day }),
      ...burst,
      ...["s1", "s2", "s3"].map((id) => vote(id, { modId: "c", ipHash: "same" })),
    ]);
    expect(flags.get("old")).toEqual([]);
    expect(flags.get("fresh")).toEqual(["new_account"]);
    expect(flags.get("b5")).toEqual(["new_account", "burst"]);
    expect(flags.get("s1")).toEqual(["shared_ip"]);
  });
});
