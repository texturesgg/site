import { describe, expect, it } from "vitest";
import {
  allowedKm,
  distanceKm,
  HARD_PAIR_AFTER_MS,
  pairUp,
  REMATCH_AFTER_MS,
  RING_AFTER_MS,
  type Waiter,
} from "./pairing";

// Places for fake players: [lat, lon]
const PLACES = {
  chicago: [41.88, -87.63],
  detroit: [42.33, -83.05],
  denver: [39.74, -104.99],
  la: [34.05, -118.24],
  london: [51.51, -0.13],
  tokyo: [35.68, 139.69],
} as const;

const NOW = 1_000_000;

function waiter(
  id: string,
  place: keyof typeof PLACES,
  waitedMs: number,
  more: Partial<Waiter> = {}
): Waiter {
  const [lat, lon] = PLACES[place];
  return {
    id,
    name: id,
    since: NOW - waitedMs,
    lat,
    lon,
    nat: "easy",
    mapped: false,
    avoid: [],
    recent: [],
    ...more,
  };
}

const ids = (pairs: ReturnType<typeof pairUp>) =>
  pairs.map((p) => [p.host.id, p.joiner.id].sort().join("+")).sort();

describe("regions widen with time", () => {
  it("knows its distances", () => {
    expect(distanceKm(waiter("a", "chicago", 0), waiter("b", "detroit", 0))).toBeLessThan(400);
    expect(distanceKm(waiter("a", "chicago", 0), waiter("b", "la", 0))).toBeGreaterThan(2500);
    expect(allowedKm(0)).toBe(1500);
    expect(allowedKm(RING_AFTER_MS[1])).toBe(5000);
    expect(allowedKm(RING_AFTER_MS[2])).toBe(Infinity);
  });

  it("pairs the closest first and leaves far players waiting", () => {
    const pairs = pairUp(
      [waiter("chi", "chicago", 5000), waiter("la", "la", 4000), waiter("det", "detroit", 1000)],
      NOW
    );
    expect(ids(pairs)).toEqual(["chi+det"]);
  });

  it("reaches across the country after 20 seconds, and anywhere after a minute", () => {
    const far = [waiter("chi", "chicago", 0), waiter("la", "la", 0)];
    expect(pairUp(far, NOW)).toEqual([]);
    far[0].since = NOW - 20_000;
    expect(ids(pairUp(far, NOW))).toEqual(["chi+la"]);

    const ocean = [waiter("lon", "london", 59_000), waiter("tok", "tokyo", 0)];
    expect(pairUp(ocean, NOW)).toEqual([]);
    ocean[0].since = NOW - 60_000;
    expect(ids(pairUp(ocean, NOW))).toEqual(["lon+tok"]);
  });

  it("goes by who waited longest", () => {
    // den waited longest, so it picks first: la is closer than chi, and chi
    // is left (chi and la are too far apart for their own first ring)
    const pairs = pairUp(
      [waiter("den", "denver", 25_000), waiter("chi", "chicago", 1000), waiter("la", "la", 1000)],
      NOW
    );
    expect(ids(pairs)).toEqual(["den+la"]);
  });
});

describe("who can play whom", () => {
  it("never pairs a pair whose games couldn't reach each other", () => {
    const a = waiter("a", "chicago", 120_000, { avoid: ["b"] });
    const b = waiter("b", "chicago", 120_000);
    expect(pairUp([a, b], NOW)).toEqual([]);
    expect(ids(pairUp([a, b, waiter("c", "la", 0)], NOW))).toEqual(["a+c"]);
  });

  it("holds back a recent opponent while anyone else may play", () => {
    const a = waiter("a", "chicago", 1000, { recent: ["b"] });
    const b = waiter("b", "chicago", 900);
    const c = waiter("c", "detroit", 100);
    expect(ids(pairUp([a, b, c], NOW))).toEqual(["a+c"]);
    // Alone together: not straight away, but after REMATCH_AFTER_MS
    expect(pairUp([a, b], NOW)).toEqual([]);
    a.since = NOW - REMATCH_AFTER_MS;
    expect(ids(pairUp([a, b], NOW))).toEqual(["a+b"]);
  });

  it("pairs two hard routers only as a last resort, through the relay", () => {
    const a = waiter("a", "chicago", 1000, { nat: "hard" });
    const b = waiter("b", "detroit", 1000, { nat: "hard" });
    expect(pairUp([a, b], NOW)).toEqual([]);
    a.since = b.since = NOW - HARD_PAIR_AFTER_MS;
    const pairs = pairUp([a, b], NOW);
    expect(ids(pairs)).toEqual(["a+b"]);
    expect(pairs[0].relay).toBe(true);
    // Someone easy to reach comes first
    const c = waiter("c", "la", 0);
    const mixed = pairUp([a, b, c], NOW);
    expect(mixed).toHaveLength(1);
    expect(mixed[0].relay).toBe(false);
    expect(mixed[0].host.id).toBe("c");
  });

  it("lets the easier one to reach host", () => {
    const hard = waiter("hard", "chicago", 5000, { nat: "hard" });
    const unknown = waiter("unk", "chicago", 1000, { nat: "unknown" });
    expect(pairUp([hard, unknown], NOW)[0].host.id).toBe("unk");
    const mapped = waiter("map", "chicago", 0, { nat: "hard", mapped: true });
    expect(pairUp([unknown, mapped], NOW)[0].host.id).toBe("map");
  });

  it("pairs a crowd once each", () => {
    const crowd = Array.from({ length: 101 }, (_, i) => waiter(`p${i}`, "chicago", i * 10));
    const pairs = pairUp(crowd, NOW);
    expect(pairs).toHaveLength(50);
    const seen = new Set(pairs.flatMap((p) => [p.host.id, p.joiner.id]));
    expect(seen.size).toBe(100);
  });
});
