import { describe, expect, it } from "vitest";
import { checkCandidates, mayOffer, normalizeCode } from "./protocol";
import { udpServer } from "./relay";

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
    expect(normalizeCode(" ab-cd ")).toBe("ABCD");
    expect(normalizeCode("ABCO")).toBeNull(); // O, I and L aren't in codes
    expect(normalizeCode("AB2D")).toBeNull(); // letters only
    expect(normalizeCode("ABC")).toBeNull();
  });
});

describe("relay servers", () => {
  it("takes the UDP TURN server from Cloudflare's list", () => {
    expect(
      udpServer([
        "stun:stun.cloudflare.com:3478",
        "turn:turn.cloudflare.com:3478?transport=udp",
        "turn:turn.cloudflare.com:3478?transport=tcp",
        "turns:turn.cloudflare.com:5349?transport=tcp",
      ])
    ).toBe("turn.cloudflare.com:3478");
    expect(udpServer(["turns:turn.cloudflare.com:5349?transport=tcp"])).toBeNull();
  });

  it("never lets a game offer a relay address itself", () => {
    expect(checkCandidates([{ addr: "198.51.100.9:3478", kind: "relay" }], "198.51.100.9")).toEqual(
      []
    );
  });
});
