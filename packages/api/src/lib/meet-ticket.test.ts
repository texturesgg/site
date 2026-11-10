import { describe, expect, it } from "vitest";
import { MEET_TICKET_TTL_MS, mintMeetTicket, readMeetTicket } from "./meet-ticket";

// A ticket is the only thing standing between a game and someone else's
// account on the meeting point, so forging, reusing late, and the key
// boundary are what's checked.
describe("meet tickets", () => {
  const secret = "a-secret-of-at-least-32-characters-long";

  it("reads back the account it was minted for, until it expires", async () => {
    const now = 1_000_000;
    const { ticket, expires } = await mintMeetTicket(secret, "user-1", now);
    expect(expires).toBe(now + MEET_TICKET_TTL_MS);
    expect(await readMeetTicket(secret, ticket, now + 1000)).toBe("user-1");
    expect(await readMeetTicket(secret, ticket, expires)).toBeNull();
  });

  it("refuses a changed payload, another key, and junk", async () => {
    const { ticket } = await mintMeetTicket(secret, "user-1");
    const [body, sig] = ticket.split(".");
    const forged = btoa(JSON.stringify({ sub: "user-2", aud: "meet", exp: Date.now() + 60_000 }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(await readMeetTicket(secret, `${forged}.${sig}`)).toBeNull();
    expect(await readMeetTicket("another-secret-of-32-characters-or-more", ticket)).toBeNull();
    expect(await readMeetTicket(secret, body)).toBeNull();
    expect(await readMeetTicket(secret, "not a ticket")).toBeNull();
  });
});
