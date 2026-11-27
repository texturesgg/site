import { describe, expect, it } from "vitest";
import {
  type AuditVote,
  COMPETITION,
  competitionAuditFlags,
  competitionPostUrlSchema,
  entryIneligible,
} from "./competition";

const eligibleFrom = Date.parse(COMPETITION.eligibleFrom);
const opens = Date.parse(COMPETITION.opens);
const day = 24 * 60 * 60 * 1000;
const minute = 60 * 1000;

describe("the competition", () => {
  it("takes mods first released on or after Dec 1, and never official ones", () => {
    const mod = { official: false, deleted: false, listed: true, firstReleaseAt: eligibleFrom };
    expect(entryIneligible(mod)).toBeNull();
    expect(entryIneligible({ ...mod, firstReleaseAt: opens })).toBeNull();
    expect(entryIneligible({ ...mod, firstReleaseAt: eligibleFrom - 1 })).toBe(
      "Only mods first released on or after Dec 1 can enter."
    );
    expect(entryIneligible({ ...mod, official: true })).toBe("Official mods aren't entries.");
    expect(entryIneligible({ ...mod, listed: false })).toBe(
      "It can be entered once a release is approved."
    );
  });

  it("takes a link to a post on X, stored as an x.com link", () => {
    const parse = (url: string) => competitionPostUrlSchema.safeParse(url).data ?? null;
    expect(parse(" https://twitter.com/Maker_1/status/123?s=20 ")).toBe(
      "https://x.com/Maker_1/status/123"
    );
    expect(parse("https://mobile.x.com/i/web/status/9")).toBe("https://x.com/i/web/status/9");
    expect(parse("https://x.com/maker")).toBeNull();
    expect(parse("https://x.com.evil.test/maker/status/1")).toBeNull();
    expect(parse("x.com/maker/status/1")).toBe("https://x.com/maker/status/1");
    expect(parse("ftp://x.com/maker/status/1")).toBeNull();
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
