import { createDb, users } from "@vgskins/db";
import { eq } from "drizzle-orm";
import type { Env } from "../types";

/**
 * Tickets for the meeting point (packages/meet): a short-lived pass the game
 * opens its WebSocket with, so the game never holds the account's token.
 *
 * A ticket is `<payload>.<signature>`, both base64url: the payload is
 * `{ sub, aud: "meet", exp }` and the signature is HMAC-SHA256 over the
 * payload's text under a key derived from BETTER_AUTH_SECRET. Only this
 * Worker holds the key; the meet Worker checks a ticket through
 * MeetEntrypoint.verifyTicket.
 */

/** How long a ticket can be used to open a connection. */
export const MEET_TICKET_TTL_MS = 2 * 60 * 1000;

const AUDIENCE = "meet";

type TicketPayload = { sub: string; aud: string; exp: number };

export type MeetPlayer = { id: string; name: string };

const encoder = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  const padded = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function ticketKey(secret: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", encoder.encode(secret), "HKDF", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(),
      info: encoder.encode("tgg-meet-ticket"),
    },
    base,
    { name: "HMAC", hash: "SHA-256", length: 256 },
    false,
    ["sign", "verify"]
  );
}

/** A ticket for `userId`, good for MEET_TICKET_TTL_MS from `now`. */
export async function mintMeetTicket(
  secret: string,
  userId: string,
  now = Date.now()
): Promise<{ ticket: string; expires: number }> {
  const expires = now + MEET_TICKET_TTL_MS;
  const payload: TicketPayload = { sub: userId, aud: AUDIENCE, exp: expires };
  const body = base64url(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign("HMAC", await ticketKey(secret), encoder.encode(body));
  return { ticket: `${body}.${base64url(new Uint8Array(signature))}`, expires };
}

/** The account a ticket is for, or null when it's malformed, forged or expired. */
export async function readMeetTicket(
  secret: string,
  ticket: string,
  now = Date.now()
): Promise<string | null> {
  if (typeof ticket !== "string" || ticket.length > 1024) return null;
  const [body, sig, extra] = ticket.split(".");
  if (!body || !sig || extra !== undefined) return null;
  const signature = fromBase64url(sig);
  if (!signature) return null;
  const valid = await crypto.subtle.verify(
    "HMAC",
    await ticketKey(secret),
    signature,
    encoder.encode(body)
  );
  if (!valid) return null;
  const raw = fromBase64url(body);
  if (!raw) return null;
  let payload: TicketPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(raw)) as TicketPayload;
  } catch {
    return null;
  }
  if (payload.aud !== AUDIENCE || typeof payload.sub !== "string") return null;
  if (typeof payload.exp !== "number" || payload.exp <= now) return null;
  return payload.sub;
}

/**
 * The player a ticket is for, checked against the account as it is now: a
 * ban since the ticket was minted refuses it, and the name is the current one.
 */
export async function verifyMeetTicket(env: Env, ticket: string): Promise<MeetPlayer | null> {
  const userId = await readMeetTicket(env.BETTER_AUTH_SECRET, ticket);
  if (!userId) return null;
  const user = await createDb(env.DB).query.users.findFirst({
    columns: { id: true, name: true, banned: true, banExpires: true },
    where: eq(users.id, userId),
  });
  if (!user) return null;
  if (user.banned && (!user.banExpires || user.banExpires.getTime() > Date.now())) return null;
  return { id: user.id, name: user.name };
}
