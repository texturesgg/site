import { DurableObject } from "cloudflare:workers";
import { MEET_MAX_GAMES, ROOM_CODE_LENGTH } from "@vgskins/shared/meet";
import { z } from "zod";
import {
  Candidate,
  Candidates,
  Member,
  Nat,
  RoomGames,
  randomToken,
  ROOM_IDLE_MS,
  ROOM_MAX_MS,
  type ServerMessage,
} from "./protocol";

/** One member of a room, as the room keeps it. */
export const Seat = Member.extend({ candidates: Candidates.nullable(), nat: Nat });
export type Seat = z.infer<typeof Seat>;

const RoomCode = z.string().length(ROOM_CODE_LENGTH);
const MemberId = Member.shape.id;
const RelayAddr = Candidate.shape.addr;
const RelayBytes = z.number().min(0);
const Report = z.object({
  outcome: z.enum(["connected", "failed"]),
  how: z.string().max(16),
  ms: z.number().min(0),
});

const RoomState = z.object({
  code: RoomCode,
  /** The most games the room takes. */
  games: RoomGames,
  /** In order of joining: the host first. */
  seats: z.array(Seat).max(MEET_MAX_GAMES),
  /** The host's session token, or null before the host and a joiner have
   * both sent candidates. A new one with each of the host's sessions. */
  token: z.string().nullable(),
  /** The joiners `meet` went to with this token. */
  met: z.array(MemberId).max(MEET_MAX_GAMES).default([]),
  /** The host started playing: nobody new joins until its next session. */
  locked: z.boolean().default(false),
  /** The host's relay address in this session, for joiners met after it. */
  relay: RelayAddr.nullable().default(null),
  /** When it was made (0: made before rooms kept it), for ROOM_MAX_MS. */
  made: z.number().default(0),
});
type RoomState = z.infer<typeof RoomState>;

/**
 * A room, named by its code: up to `games` members, the host first. Netplay
 * is a star through the host, so each joiner meets only the host: once the
 * host and a joiner have both sent candidates, the two of them get `meet`
 * with the host's session token, and their games punch through. A joiner who
 * arrives later meets the host the same way, until the host locks the room
 * by starting to play. New candidates from the host mean a new session (a
 * drop ended the old one), so every joiner meets it again; new ones from a
 * joiner meet just that joiner again. It closes when the host leaves, after
 * ROOM_IDLE_MS without anything happening unless the host is still in it
 * (playing, say), and after ROOM_MAX_MS whatever happens.
 *
 * A room sends to its members' Player DOs: at most two calls per member
 * per change (16 at MEET_MAX_GAMES), never in a loop of its own.
 */
export class Room extends DurableObject<MeetEnv> {
  private state: RoomState | null = null;

  constructor(ctx: DurableObjectState, env: MeetEnv) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      const stored = RoomState.safeParse(await ctx.storage.get("room"));
      this.state = stored.success ? stored.data : null;
    });
  }

  /** Makes this room with `host` in it; false when the code is taken. */
  async create(code: string, host: Seat, games: number): Promise<boolean> {
    if (this.state) return false;
    this.state = {
      code: RoomCode.parse(code),
      games: RoomGames.parse(games),
      seats: [Seat.parse(host)],
      token: null,
      met: [],
      locked: false,
      relay: null,
      made: Date.now(),
    };
    await this.changed();
    return true;
  }

  /** Adds a member; an error for the player, or null. */
  async join(input: Seat): Promise<string | null> {
    const member = Seat.parse(input);
    const room = this.state;
    if (!room) return "There's no room with that code.";
    if (room.seats.some((s) => s.id === member.id)) {
      await this.changed();
      return null;
    }
    if (room.locked) return "That room is already playing.";
    if (room.seats.length >= room.games) return "That room is full.";
    room.seats.push(member);
    await this.changed();
    return null;
  }

  async leave(input: string): Promise<void> {
    const memberId = MemberId.parse(input);
    const room = this.state;
    if (!room) return;
    const index = room.seats.findIndex((s) => s.id === memberId);
    if (index < 0) return;
    if (index === 0) {
      await this.close("The host left the room.", memberId);
      return;
    }
    room.seats.splice(index, 1);
    room.met = room.met.filter((id) => id !== memberId);
    await this.changed();
  }

  async candidates(memberId: string, list: Seat["candidates"], nat: Nat): Promise<void> {
    const room = this.state;
    const id = MemberId.parse(memberId);
    const seat = room?.seats.find((s) => s.id === id);
    if (!room || !seat) return;
    seat.candidates = Candidates.parse(list);
    seat.nat = Nat.parse(nat);
    if (room.seats[0].id === id) {
      // The host's new session: everyone meets it again, and it takes joiners again
      room.token = null;
      room.met = [];
      room.locked = false;
      room.relay = null;
    } else {
      room.met = room.met.filter((m) => m !== id);
    }
    await this.changed();
  }

  /** The host started playing: nobody new joins until its next session. */
  async lock(memberId: string): Promise<void> {
    const room = this.state;
    if (!room || room.seats[0].id !== MemberId.parse(memberId) || room.locked) return;
    room.locked = true;
    await this.changed();
  }

  /** How a member's connection attempt went, for deciding on a relay. */
  report(memberId: string, input: z.input<typeof Report>): void {
    const { outcome, how, ms } = Report.parse(input);
    const room = this.state;
    const seat = room?.seats.find((s) => s.id === memberId);
    if (!room || !seat) return;
    const others = room.seats.filter((s) => s.id !== memberId).map((s) => s.nat);
    this.env.MEET_EVENTS.writeDataPoint({
      blobs: [outcome, how, seat.nat, others.join(","), "1"],
      doubles: [1, ms],
      indexes: [outcome],
    });
  }

  /** Whether `memberId` may ask for a relay: the host of a room that met. */
  canRelay(memberId: string): boolean {
    const room = this.state;
    return room !== null && room.token !== null && room.seats[0]?.id === memberId;
  }

  /** The host's relay address, for the joiners to say hello to, now and later. */
  async relayPeer(memberId: string, input: string): Promise<void> {
    const addr = RelayAddr.parse(input);
    const room = this.state;
    if (!room || room.seats[0]?.id !== memberId) return;
    room.relay = addr;
    await this.ctx.storage.put("room", room);
    await Promise.all(
      room.seats.slice(1).map((s) => this.send(s.id, { type: "relay.peer", addr }))
    );
  }

  /** Bytes through the host's relay, for what the relay costs. */
  relayBytes(memberId: string, input: number): void {
    const bytes = RelayBytes.parse(input);
    const room = this.state;
    if (!room || room.seats[0]?.id !== memberId) return;
    this.env.MEET_EVENTS.writeDataPoint({
      blobs: ["relay-bytes", "relay", room.seats[0].nat, "", "1"],
      doubles: [1, 0, bytes],
      indexes: ["relay-bytes"],
    });
  }

  /** Idle for ROOM_IDLE_MS: closes unless the host is still in it, and in any
   * case once it's ROOM_MAX_MS old. One call to the host's Player DO each
   * ROOM_IDLE_MS, so at most 24 in a room's life. */
  async alarm(): Promise<void> {
    const room = this.state;
    if (!room) return;
    const now = Date.now();
    const end = (room.made || now) + ROOM_MAX_MS;
    if (now >= end) {
      await this.close("The room closed after 12 hours.", null);
      return;
    }
    const host = this.env.PLAYER.get(this.env.PLAYER.idFromName(room.seats[0].id));
    if (z.boolean().parse(await host.inRoom(room.code))) {
      await this.ctx.storage.setAlarm(Math.min(now + ROOM_IDLE_MS, end));
      return;
    }
    await this.close("The room closed after 30 minutes.", null);
  }

  /** Saves, tells everyone, and sends `meet` to the host and each joiner
   * ready to meet it. */
  private async changed(): Promise<void> {
    const room = this.state;
    if (!room) return;
    const host = room.seats[0];
    const due =
      host.candidates === null || room.locked
        ? []
        : room.seats
            .map((seat, side) => ({ seat, side }))
            .filter(
              ({ seat, side }) =>
                side > 0 && seat.candidates !== null && !room.met.includes(seat.id)
            );
    if (due.length > 0 && room.token === null) room.token = randomToken();
    const token = room.token;
    room.met = [...room.met, ...due.map(({ seat }) => seat.id)];
    await this.ctx.storage.put("room", room);
    const now = Date.now();
    await this.ctx.storage.setAlarm(Math.min(now + ROOM_IDLE_MS, (room.made || now) + ROOM_MAX_MS));

    const roster: ServerMessage = {
      type: "room",
      code: room.code,
      host: host.name,
      members: room.seats.map((s) => s.name),
      games: room.games,
      locked: room.locked,
    };
    await Promise.all(room.seats.map((s) => this.send(s.id, roster)));
    if (token === null || due.length === 0) return;
    const relay = room.relay;
    await Promise.all(
      due.flatMap(({ seat, side }) => [
        this.send(host.id, meet(room.code, 0, token, seat, side)),
        this.send(seat.id, meet(room.code, side, token, host, 0)).then(() =>
          relay === null ? undefined : this.send(seat.id, { type: "relay.peer", addr: relay })
        ),
      ])
    );
  }

  private async close(why: string, except: string | null): Promise<void> {
    const room = this.state;
    this.state = null;
    await this.ctx.storage.deleteAll();
    await this.ctx.storage.deleteAlarm();
    if (!room) return;
    await Promise.all(
      room.seats
        .filter((s) => s.id !== except)
        .map((s) => this.send(s.id, { type: "closed", why }, room.code))
    );
  }

  private send(memberId: string, message: ServerMessage, leftRoom?: string): Promise<void> {
    const player = this.env.PLAYER.get(this.env.PLAYER.idFromName(memberId));
    return player.deliver(message, leftRoom ?? null);
  }
}

/** `meet` for the game on `side`: the other game is `other`, on `otherSide`. */
function meet(
  code: string,
  side: number,
  token: string,
  other: Seat,
  otherSide: number
): ServerMessage {
  return {
    type: "meet",
    code,
    side,
    token,
    peers: [
      {
        side: otherSide,
        name: other.name,
        candidates: other.candidates ?? [],
        nat: other.nat,
      },
    ],
  };
}
