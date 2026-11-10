import { DurableObject } from "cloudflare:workers";
import {
  type Candidate,
  type Member,
  randomToken,
  ROOM_IDLE_MS,
  type ServerMessage,
} from "./protocol";

/** One member of a room, as the room keeps it. */
export type Seat = Member & { candidates: Candidate[] | null; nat: string };

type RoomState = {
  code: string;
  games: number;
  /** In side order: the host first. */
  seats: Seat[];
  /** The session token of the last `meet`, or null before one. */
  token: string | null;
};

/**
 * A room, named by its code: up to `games` members, the host first. Once the
 * room is full and every member has sent its candidates, every member gets
 * `meet` at once, and their games punch through to each other. It closes when
 * the host leaves or after ROOM_IDLE_MS without anything happening.
 *
 * A room sends to its members' Player DOs: at most `games` (2) calls per
 * change, never in a loop of its own.
 */
export class Room extends DurableObject<MeetEnv> {
  private state: RoomState | null = null;

  constructor(ctx: DurableObjectState, env: MeetEnv) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.state = (await ctx.storage.get<RoomState>("room")) ?? null;
    });
  }

  /** Makes this room with `host` in it; false when the code is taken. */
  async create(code: string, host: Seat, games: number): Promise<boolean> {
    if (this.state) return false;
    this.state = {
      code,
      games,
      seats: [{ ...host }],
      token: null,
    };
    await this.changed();
    return true;
  }

  /** Adds a member; an error for the player, or null. */
  async join(member: Seat): Promise<string | null> {
    const room = this.state;
    if (!room) return "There's no room with that code.";
    if (room.seats.some((s) => s.id === member.id)) {
      await this.changed();
      return null;
    }
    if (room.seats.length >= room.games) return "That room is full.";
    room.seats.push({ ...member });
    room.token = null;
    await this.changed();
    return null;
  }

  async leave(memberId: string): Promise<void> {
    const room = this.state;
    if (!room) return;
    const index = room.seats.findIndex((s) => s.id === memberId);
    if (index < 0) return;
    if (index === 0) {
      await this.close("The host left the room.", memberId);
      return;
    }
    room.seats.splice(index, 1);
    room.token = null;
    await this.changed();
  }

  async candidates(memberId: string, list: Candidate[], nat: string): Promise<void> {
    const seat = this.state?.seats.find((s) => s.id === memberId);
    if (!seat) return;
    seat.candidates = list;
    seat.nat = nat;
    await this.changed();
  }

  /** How a member's connection attempt went, for deciding on a relay. */
  report(memberId: string, outcome: "connected" | "failed", how: string, ms: number): void {
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

  async alarm(): Promise<void> {
    await this.close("The room closed after 30 minutes.", null);
  }

  /** Saves, tells everyone, and sends `meet` once the room is ready. */
  private async changed(): Promise<void> {
    const room = this.state;
    if (!room) return;
    const ready =
      room.seats.length === room.games && room.seats.every((s) => s.candidates !== null);
    const meeting = ready && room.token === null;
    if (meeting) room.token = randomToken();
    await this.ctx.storage.put("room", room);
    await this.ctx.storage.setAlarm(Date.now() + ROOM_IDLE_MS);

    const roster: ServerMessage = {
      type: "room",
      code: room.code,
      host: room.seats[0].name,
      members: room.seats.map((s) => s.name),
      games: room.games,
    };
    await Promise.all(room.seats.map((s) => this.send(s.id, roster)));
    if (!meeting) return;
    await Promise.all(
      room.seats.map((seat, side) =>
        this.send(seat.id, {
          type: "meet",
          code: room.code,
          side,
          token: room.token!,
          peers: room.seats
            .map((other, otherSide) => ({ other, otherSide }))
            .filter(({ otherSide }) => otherSide !== side)
            .map(({ other, otherSide }) => ({
              side: otherSide,
              name: other.name,
              candidates: other.candidates ?? [],
              nat: other.nat,
            })),
        })
      )
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
