import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { relayTotalDaily } from "./relay";

// The cap on relayed sessions across every account: what keeps free accounts
// from running up the relay bill together.
describe("the relay's daily total", () => {
  it("lets sessions through up to the cap, then refuses them", async () => {
    const directory = env.DIRECTORY.get(env.DIRECTORY.idFromName("relay-cap"));
    expect(await directory.takeRelay(2)).toBe(true);
    expect(await directory.takeRelay(2)).toBe(true);
    expect(await directory.takeRelay(2)).toBe(false);
    // Raising it lets more through the same day
    expect(await directory.takeRelay(3)).toBe(true);
  });

  it("is off at zero", async () => {
    const directory = env.DIRECTORY.get(env.DIRECTORY.idFromName("relay-off"));
    expect(await directory.takeRelay(0)).toBe(false);
  });

  it("reads the setting, and a broken one closes the relay", () => {
    expect(relayTotalDaily({ RELAY_TOTAL_DAILY: "300" })).toBe(300);
    expect(relayTotalDaily({ RELAY_TOTAL_DAILY: "0" })).toBe(0);
    expect(relayTotalDaily({ RELAY_TOTAL_DAILY: "lots" })).toBe(0);
    expect(relayTotalDaily({ RELAY_TOTAL_DAILY: "-5" })).toBe(0);
  });
});
