import { describe, expect, it } from "vitest";
import { checkCandidates, mayOffer, normalizeCode } from "./protocol";

// The address check is what keeps the meeting point from being used to aim
// other players' games at someone else's machine.
describe("candidates", () => {
  it("lets private addresses through and holds public ones to the connection's own", () => {
    expect(mayOffer("192.168.1.20", "203.0.113.7")).toBe(true);
    expect(mayOffer("100.101.102.103", "203.0.113.7")).toBe(true); // Tailscale / CGNAT
    expect(mayOffer("203.0.113.7", "203.0.113.7")).toBe(true);
    expect(mayOffer("198.51.100.9", "203.0.113.7")).toBe(false);
    expect(mayOffer("2001:db8:1:2::99", "2001:db8:1:2:aaaa::1")).toBe(true);
    expect(mayOffer("2001:db8:1:3::99", "2001:db8:1:2:aaaa::1")).toBe(false);
    // The other family can't be checked from one connection.
    expect(mayOffer("2001:db8:1:3::99", "203.0.113.7")).toBe(true);
  });

  it("drops what it can't read", () => {
    const list = checkCandidates(
      [
        { addr: "203.0.113.7:51000", kind: "stun" },
        { addr: "198.51.100.9:51000", kind: "stun" },
        { addr: "not-an-address", kind: "local" },
        { addr: "[2001:db8::1]:51000", kind: "stun6" },
      ],
      "203.0.113.7"
    );
    expect(list.map((c) => c.addr)).toEqual(["203.0.113.7:51000", "[2001:db8::1]:51000"]);
  });
});

describe("codes", () => {
  it("reads codes the way people type them", () => {
    expect(normalizeCode(" abc-23x ")).toBe("ABC23X");
    expect(normalizeCode("ABC10X")).toBeNull(); // 1 and 0 aren't in codes
    expect(normalizeCode("ABC")).toBeNull();
  });
});
