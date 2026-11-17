import { z } from "zod";
import { Member, Nat } from "./protocol";

/**
 * Who plays whom in a queue: plain functions over the waiting players, so
 * the rule is tested without a Durable Object (pairing.test.ts).
 *
 * The longest-waiting player goes first and gets the closest player they may
 * play: within RING_KM[0] at first, RING_KM[1] once they've waited
 * RING_AFTER_MS[1], anyone after RING_AFTER_MS[2]. Two routers that can't be
 * punched through ("hard") are paired only as a last resort, after
 * HARD_PAIR_AFTER_MS when nobody else may play either of them, and that pair
 * goes straight to the relay. Two players whose games already failed to reach
 * each other this connection are never paired again. Someone you just
 * played comes back only when nobody else may play you and you've waited
 * REMATCH_AFTER_MS.
 */

/** At most this many players avoided, and this many recent opponents. */
export const MAX_AVOID = 8;
export const MAX_RECENT = 4;

export const Waiter = z.object({
  ...Member.shape,
  /** When they started searching; a failed match keeps the old time, so they
   * go back to the front. */
  since: z.number(),
  /** Where Cloudflare says they connect from, or null when it doesn't say. */
  lat: z.number().min(-90).max(90).nullable(),
  lon: z.number().min(-180).max(180).nullable(),
  nat: Nat,
  /** A candidate of kind "mapped": the router forwards a port to the game. */
  mapped: z.boolean(),
  /** Players this one must not be paired with: failed to connect this
   * connection. */
  avoid: z.array(z.string()).max(MAX_AVOID),
  /** Players this one played recently. */
  recent: z.array(z.string()).max(MAX_RECENT),
});
export type Waiter = z.infer<typeof Waiter>;

/** How far apart two players may be, by how long the first has waited. */
export const RING_KM = [1500, 5000, Infinity];
export const RING_AFTER_MS = [0, 20_000, 60_000];
/** How long before a recent opponent is allowed back, when nobody else is. */
export const REMATCH_AFTER_MS = 15_000;
/** Distance assumed for a player with no location: inside the second ring. */
export const UNKNOWN_KM = 3000;
/** Two hard routers wait at least this long, then go through the relay. */
export const HARD_PAIR_AFTER_MS = 60_000;

export function allowedKm(waitedMs: number): number {
  let km = RING_KM[0];
  for (let i = 0; i < RING_KM.length; i++) {
    if (waitedMs >= RING_AFTER_MS[i]) km = RING_KM[i];
  }
  return km;
}

/** Great-circle distance in km. */
export function distanceKm(a: Waiter, b: Waiter): number {
  if (a.lat === null || a.lon === null || b.lat === null || b.lon === null) return UNKNOWN_KM;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Whether these two may be paired at all. */
export function compatible(a: Waiter, b: Waiter): boolean {
  if (a.id === b.id) return false;
  return !a.avoid.includes(b.id) && !b.avoid.includes(a.id);
}

/** Two routers that can't be punched through: only through the relay. */
export function needsRelay(a: Waiter, b: Waiter): boolean {
  return a.nat === "hard" && b.nat === "hard" && !a.mapped && !b.mapped;
}

function recent(a: Waiter, b: Waiter): boolean {
  return a.recent.includes(b.id) || b.recent.includes(a.id);
}

/** How hard a player's game is to reach: the lowest hosts. */
function reach(w: Waiter): number {
  if (w.mapped) return 0;
  return w.nat === "easy" ? 1 : w.nat === "unknown" ? 2 : 3;
}

/** The pair in host-first order: the easier one to reach hosts, and on a tie
 * whoever waited longer. */
export function hostFirst(a: Waiter, b: Waiter): [Waiter, Waiter] {
  const ra = reach(a);
  const rb = reach(b);
  if (ra !== rb) return ra < rb ? [a, b] : [b, a];
  return a.since <= b.since ? [a, b] : [b, a];
}

export type Pair = { host: Waiter; joiner: Waiter; relay: boolean };

/**
 * The pairs to make now. Each player is in at most one. At most
 * waiters.length² comparisons a pass (the queue caps waiters, MAX_WAITING),
 * and two passes: the second only for players left over after the first.
 */
export function pairUp(waiters: Waiter[], now: number): Pair[] {
  const order = [...waiters].sort((a, b) => a.since - b.since || (a.id < b.id ? -1 : 1));
  const taken = new Set<string>();
  const pairs: Pair[] = [];
  const add = (a: Waiter, b: Waiter) => {
    taken.add(a.id);
    taken.add(b.id);
    const [host, joiner] = hostFirst(a, b);
    pairs.push({ host, joiner, relay: needsRelay(a, b) });
  };
  // Punchable pairs first, recent opponents only when nobody else
  for (const a of order) {
    if (taken.has(a.id)) continue;
    const waited = now - a.since;
    const limit = allowedKm(waited);
    let best: Waiter | null = null;
    let bestKm = Infinity;
    let rematch: Waiter | null = null;
    let rematchKm = Infinity;
    for (const b of order) {
      if (taken.has(b.id) || !compatible(a, b) || needsRelay(a, b)) continue;
      const km = distanceKm(a, b);
      if (km > limit) continue;
      if (recent(a, b)) {
        if (km < rematchKm) {
          rematch = b;
          rematchKm = km;
        }
      } else if (km < bestKm) {
        best = b;
        bestKm = km;
      }
    }
    const b = best ?? (waited >= REMATCH_AFTER_MS ? rematch : null);
    if (b) add(a, b);
  }
  // Then two hard routers, through the relay, once both have waited long
  // enough that nobody else was found for them
  for (const a of order) {
    if (taken.has(a.id) || now - a.since < HARD_PAIR_AFTER_MS) continue;
    let best: Waiter | null = null;
    let bestKm = Infinity;
    for (const b of order) {
      if (taken.has(b.id) || !compatible(a, b) || !needsRelay(a, b)) continue;
      if (now - b.since < HARD_PAIR_AFTER_MS) continue;
      const km = distanceKm(a, b) + (recent(a, b) ? 1e6 : 0);
      if (km < bestKm) {
        best = b;
        bestKm = km;
      }
    }
    if (best) add(a, best);
  }
  return pairs;
}
