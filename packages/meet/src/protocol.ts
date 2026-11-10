import { z } from "zod";

/**
 * The messages between a game and the meeting point: JSON text frames on the
 * WebSocket. tgg-melee-goals/matchmaking.md is the design.
 */

/** The most a game may send in one message. */
export const MAX_MESSAGE_BYTES = 4096;

/** At most this many messages in MESSAGE_WINDOW_MS, then the socket closes. */
export const MESSAGE_BUDGET = 20;
export const MESSAGE_WINDOW_MS = 10_000;

/** Room joins per account per minute and per day, wrong codes included, so codes
 * can't be guessed. */
export const JOIN_BUDGET = 5;
export const JOIN_WINDOW_MS = 60_000;
export const JOIN_DAILY = 60;

/** Relayed sessions per account per day: the hard cap on what the relay can cost. */
export const RELAY_DAILY = 30;
/** How long relay credentials work. */
export const RELAY_TTL_S = 600;

/** The most candidates a game may offer. */
export const MAX_CANDIDATES = 8;

/** Codes: letters only, so the game's own keyboard types them without its digits
 * page, and no look-alikes (I, L, O). */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ";
export const CODE_LENGTH = 4;

/** A room nobody touched for this long closes. */
export const ROOM_IDLE_MS = 30 * 60 * 1000;

const Candidate = z.object({
  /** "1.2.3.4:51000" or "[2001:db8::1]:51000" */
  addr: z.string().max(64),
  /** where it came from: local, tailscale, stun, stun6, mapped */
  kind: z.enum(["local", "tailscale", "stun", "stun6", "mapped", "relay"]),
});
export type Candidate = z.infer<typeof Candidate>;

const Nat = z.enum(["easy", "hard", "unknown"]);

export const ClientMessage = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("hello"),
    game: z.string().max(64),
    target: z.string().max(64),
    versions: z.string().max(64),
  }),
  z.object({ type: z.literal("room.make"), games: z.number().int().min(2).max(2).default(2) }),
  z.object({ type: z.literal("room.join"), code: z.string().max(16) }),
  z.object({ type: z.literal("room.leave") }),
  z.object({
    type: z.literal("candidates"),
    list: z.array(Candidate).max(MAX_CANDIDATES),
    nat: Nat.default("unknown"),
  }),
  z.object({
    type: z.literal("connected"),
    how: z.enum(["local", "tailscale", "stun", "stun6", "mapped", "relay", "other"]),
    ms: z.number().min(0).max(120_000),
  }),
  z.object({ type: z.literal("failed"), why: z.string().max(200) }),
  // The host: direct punching hasn't got through, so it wants a relay.
  z.object({ type: z.literal("relay.request") }),
  // The host: its address on the relay, for the other games.
  z.object({ type: z.literal("relay.ready"), addr: z.string().max(64) }),
  // The host: bytes that went through its relay since its last report.
  z.object({ type: z.literal("relay.bytes"), bytes: z.number().min(0).max(1e12) }),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

export type Member = { id: string; name: string };

export type ServerMessage =
  | { type: "welcome"; name: string }
  | { type: "room"; code: string; host: string; members: string[]; games: number }
  | {
      type: "meet";
      code: string;
      side: number;
      token: string;
      peers: { side: number; name: string; candidates: Candidate[]; nat: string }[];
    }
  | { type: "relay"; server: string; username: string; credential: string }
  | { type: "relay.peer"; addr: string }
  | { type: "closed"; why: string }
  | { type: "error"; message: string };

/** A code the way the player typed it, or null when it can't be one. */
export function normalizeCode(text: string): string | null {
  const code = text.trim().toUpperCase().replace(/[\s-]/g, "");
  if (code.length !== CODE_LENGTH) return null;
  for (const c of code) {
    if (!CODE_ALPHABET.includes(c)) return null;
  }
  return code;
}

export function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  let code = "";
  for (const b of bytes) code += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return code;
}

/** 16 hex digits, the session token netplay's hello carries. */
export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ---- Addresses ----------------------------------------------------------------

/** "host:port" or "[v6]:port" split, or null. */
export function splitAddr(addr: string): { host: string; port: number } | null {
  const m = /^\[([0-9a-fA-F:.]+)\]:(\d{1,5})$/.exec(addr) ?? /^([0-9.]+):(\d{1,5})$/.exec(addr);
  if (!m) return null;
  const port = Number(m[2]);
  if (port < 1 || port > 65535) return null;
  return { host: m[1], port };
}

function v4Bytes(host: string): number[] | null {
  const parts = host.split(".");
  if (parts.length !== 4) return null;
  const bytes = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN));
  return bytes.every((b) => b >= 0 && b <= 255) ? bytes : null;
}

/** The 8 groups of an IPv6 address, or null. */
function v6Groups(host: string): number[] | null {
  if (!host.includes(":") || host.includes(".")) return null;
  const halves = host.split("::");
  if (halves.length > 2) return null;
  const parse = (s: string) => (s === "" ? [] : s.split(":"));
  const head = parse(halves[0]);
  const tail = halves.length === 2 ? parse(halves[1]) : [];
  const missing = 8 - head.length - tail.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return null;
  const groups = [...head, ...Array(missing).fill("0"), ...tail].map((g) =>
    /^[0-9a-fA-F]{1,4}$/.test(g) ? parseInt(g, 16) : NaN
  );
  return groups.every((g) => !Number.isNaN(g)) ? groups : null;
}

/** Whether an address is on the public internet (not private, CGNAT, link-local, ...). */
export function isPublic(host: string): boolean {
  const v4 = v4Bytes(host);
  if (v4) {
    const [a, b] = v4;
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b < 128) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b < 32) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  const v6 = v6Groups(host);
  if (v6) {
    return (v6[0] & 0xe000) === 0x2000; // global unicast, 2000::/3
  }
  return false;
}

/**
 * Whether a public candidate may be offered by a game connecting from
 * `from`: an address of the connection's own family has to be the
 * connection's (the same IPv4, or the same IPv6 /64), so nobody can point
 * other games' punching at someone else. The other family can't be checked
 * from one connection and is let through (a connection from nowhere
 * readable offers no public address at all); punching is capped on the game's
 * side (8 candidates, 20 packets a second, 10 seconds).
 */
export function mayOffer(host: string, from: string): boolean {
  if (!isPublic(host)) return true;
  const hostV4 = v4Bytes(host);
  const fromV4 = v4Bytes(from);
  if (hostV4 && fromV4) return hostV4.join(".") === fromV4.join(".");
  const hostV6 = v6Groups(host);
  const fromV6 = v6Groups(from);
  if (hostV6 && fromV6) return hostV6.slice(0, 4).every((g, i) => g === fromV6[i]);
  return fromV4 !== null || fromV6 !== null;
}

/** The candidates a game may offer, from what it sent. */
export function checkCandidates(list: Candidate[], from: string): Candidate[] {
  return list.filter((c) => {
    if (c.kind === "relay") return false; // only the meeting point hands those out
    const parts = splitAddr(c.addr);
    return parts !== null && mayOffer(parts.host, from);
  });
}
