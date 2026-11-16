import { DurableObject } from "cloudflare:workers";
import type { Nat } from "./pairing";
import {
  type Candidate,
  checkCandidates,
  ClientMessage,
  JOIN_BUDGET,
  JOIN_DAILY,
  JOIN_WINDOW_MS,
  MAX_MESSAGE_BYTES,
  MESSAGE_BUDGET,
  MESSAGE_WINDOW_MS,
  normalizeCode,
  RELAY_DAILY,
  RELAY_TTL_S,
  randomCode,
  type ServerMessage,
  splitAddr,
} from "./protocol";
import { type Matched, queueKey } from "./queue";
import { relayCredentials } from "./relay";
import type { Seat } from "./room";

/** A queue match this connection is in: for its reports, the relay, and
 * going back to the front of the queue when it fails. */
type QueueMatch = {
  key: string;
  mode: string;
  token: string;
  side: number;
  opponent: string;
  since: number;
  at: number;
};

/** What a connection remembers across hibernation (at most 2 KB: candidates
 * and the hello are in storage). */
type Attachment = {
  id: string;
  name: string;
  /** The address the connection comes from. */
  ip: string;
  /** Where Cloudflare says it connects from. */
  lat: number | null;
  lon: number | null;
  room: string | null;
  nat: string;
  messages: { start: number; count: number };
  joins: { start: number; count: number };
  /** When this connection was last given relay credentials (0: never). */
  relayAt: number;
  /** The queue it's searching in. */
  search: { key: string; mode: string } | null;
  match: QueueMatch | null;
  /** After a failed match: searching this queue again before `until` starts
   * from `since`, the front. `requeues` counts them. */
  front: { key: string; since: number; until: number; requeues: number } | null;
  /** Players this connection's games couldn't reach: never paired again. */
  avoid: string[];
  /** The last counts sent, so a game asking too often gets them again. */
  counts: { at: number; mode: string; label: string; searching: number } | null;
};

/** What the game said in its hello, kept for its searches. */
type Hello = { version: string; versions: string; all: string; strict: boolean; names: string };

/** Codes tried before giving up on making a room. */
const CODE_ATTEMPTS = 5;
/** A queue match's reports, relay and failure count for this long. */
export const MATCH_MS = 2 * 60 * 1000;
/** Failed matches that put a search back at the front, per search. */
export const MAX_REQUEUES = 3;
/** Counts are asked of the queue at most this often per connection. */
export const COUNTS_MS = 15_000;
/** Opponents count as recent for this long. */
export const RECENT_MS = 10 * 60 * 1000;
/** At most this many players avoided, and this many recent opponents. */
const MAX_AVOID = 8;
const MAX_RECENT = 4;

/**
 * One account's connection to the meeting point. A second connection replaces
 * the first. It hibernates between messages; keepalive pings are answered
 * without waking it.
 */
export class Player extends DurableObject<MeetEnv> {
  constructor(ctx: DurableObjectState, env: MeetEnv) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  /** A WebSocket upgrade from the Worker, which has checked the ticket. */
  async fetch(request: Request): Promise<Response> {
    const id = request.headers.get("x-meet-user");
    const name = request.headers.get("x-meet-name");
    const ip = request.headers.get("x-meet-ip") ?? "";
    if (!id || !name) return new Response("Missing player", { status: 400 });

    for (const old of this.ctx.getWebSockets()) {
      await this.leaveAll(old);
      old.close(4000, "Signed in somewhere else.");
    }
    await this.ctx.storage.delete(["hello", "candidates"]);

    const pair = new WebSocketPair();
    const attachment: Attachment = {
      id,
      name,
      ip,
      lat: coordinate(request.headers.get("x-meet-lat"), 90),
      lon: coordinate(request.headers.get("x-meet-lon"), 180),
      room: null,
      nat: "unknown",
      messages: { start: Date.now(), count: 0 },
      joins: { start: Date.now(), count: 0 },
      relayAt: 0,
      search: null,
      match: null,
      front: null,
      avoid: [],
      counts: null,
    };
    this.ctx.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment(attachment);
    send(pair[1], { type: "welcome", name });
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): Promise<void> {
    const me = ws.deserializeAttachment() as Attachment;
    const now = Date.now();
    if (now - me.messages.start > MESSAGE_WINDOW_MS) me.messages = { start: now, count: 0 };
    me.messages.count++;
    if (me.messages.count > MESSAGE_BUDGET) {
      await this.leaveAll(ws);
      ws.close(4008, "Too many messages.");
      return;
    }
    ws.serializeAttachment(me);

    const text = typeof data === "string" ? data : new TextDecoder().decode(data);
    if (text.length > MAX_MESSAGE_BYTES) {
      send(ws, { type: "error", message: "That message is too big." });
      return;
    }
    let parsed: ClientMessage;
    try {
      const result = ClientMessage.safeParse(JSON.parse(text));
      if (!result.success) {
        send(ws, {
          type: "error",
          message: "The game sent something the meeting point doesn't know.",
        });
        return;
      }
      parsed = result.data;
    } catch {
      send(ws, { type: "error", message: "The game sent something that isn't JSON." });
      return;
    }
    await this.handle(ws, me, parsed);
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    await this.leaveAll(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.leaveAll(ws);
  }

  /** A room's message for this player. `leftRoom` is a room that closed. */
  deliver(message: ServerMessage, leftRoom: string | null): void {
    for (const ws of this.ctx.getWebSockets()) {
      if (leftRoom !== null) {
        const me = ws.deserializeAttachment() as Attachment;
        if (me.room !== leftRoom) continue;
        me.room = null;
        ws.serializeAttachment(me);
      }
      send(ws, message);
    }
  }

  /** The queue paired this player: the game gets `meet`. False when the
   * player isn't searching there any more. */
  async matched(m: Matched): Promise<boolean> {
    for (const ws of this.ctx.getWebSockets()) {
      const me = ws.deserializeAttachment() as Attachment;
      if (me.search?.key !== m.key) continue;
      me.search = null;
      me.match = {
        key: m.key,
        mode: m.mode,
        token: m.token,
        side: m.side,
        opponent: m.opponent.id,
        since: m.since,
        at: Date.now(),
      };
      ws.serializeAttachment(me);
      await this.addRecent(m.opponent.id);
      send(ws, {
        type: "meet",
        code: "",
        side: m.side,
        token: m.token,
        peers: [
          {
            side: 1 - m.side,
            name: m.opponent.name,
            candidates: m.opponent.candidates,
            nat: m.opponent.nat,
          },
        ],
        queue: { mode: m.mode, relay: m.relay },
      });
      return true;
    }
    return false;
  }

  /** The queue ended this player's search: too long, or the queue gave up. */
  searchEnded(key: string, why: string): void {
    for (const ws of this.ctx.getWebSockets()) {
      const me = ws.deserializeAttachment() as Attachment;
      if (me.search?.key !== key) continue;
      me.search = null;
      ws.serializeAttachment(me);
      send(ws, { type: "search.ended", why });
    }
  }

  /** The other game of a queue match took a relay: its address on it. */
  relayPeer(token: string, addr: string): void {
    for (const ws of this.ctx.getWebSockets()) {
      const me = ws.deserializeAttachment() as Attachment;
      if (me.match?.token === token) send(ws, { type: "relay.peer", addr });
    }
  }

  private async handle(ws: WebSocket, me: Attachment, message: ClientMessage): Promise<void> {
    switch (message.type) {
      case "hello": {
        const hello: Hello = {
          version: message.version,
          versions: message.versions,
          all: message.all,
          strict: message.strict,
          names: message.names,
        };
        await this.ctx.storage.put("hello", hello);
        return;
      }
      case "room.make": {
        await this.leaveAll(ws);
        const member = await this.seat(me);
        for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
          const code = randomCode();
          if (await this.room(code).create(code, member, message.games)) {
            this.update(ws, (a) => (a.room = code));
            return;
          }
        }
        send(ws, { type: "error", message: "Couldn't make a room. Try again." });
        return;
      }
      case "room.join": {
        const now = Date.now();
        if (now - me.joins.start > JOIN_WINDOW_MS) me.joins = { start: now, count: 0 };
        me.joins.count++;
        ws.serializeAttachment(me);
        if (me.joins.count > JOIN_BUDGET) {
          send(ws, { type: "error", message: "Too many tries. Wait a minute and try again." });
          return;
        }
        if (!(await this.countToday("joins", JOIN_DAILY))) {
          send(ws, { type: "error", message: "Too many tries today. Try again tomorrow." });
          return;
        }
        const code = normalizeCode(message.code);
        if (code === null) {
          send(ws, { type: "error", message: "Room codes are 4 letters." });
          return;
        }
        if (me.room === code) return;
        await this.leaveAll(ws);
        const error = await this.room(code).join(await this.seat(me));
        if (error !== null) {
          send(ws, { type: "error", message: error });
          return;
        }
        this.update(ws, (a) => (a.room = code));
        return;
      }
      case "room.leave":
        await this.leaveRoom(ws);
        return;
      case "candidates": {
        const candidates = checkCandidates(message.list, me.ip);
        await this.ctx.storage.put("candidates", candidates);
        this.update(ws, (a) => (a.nat = message.nat));
        if (me.room !== null) await this.room(me.room).candidates(me.id, candidates, message.nat);
        return;
      }
      case "search":
        await this.search(ws, message.mode);
        return;
      case "search.stop":
        await this.leaveQueue(ws);
        return;
      case "counts":
        await this.counts(ws, message.mode);
        return;
      case "connected": {
        const match = this.currentMatch(me);
        if (match) {
          this.report("connected", message.how, me.nat, message.ms);
        } else if (me.room !== null) {
          await this.room(me.room).report(me.id, "connected", message.how, message.ms);
        }
        return;
      }
      case "failed": {
        const match = this.currentMatch(me);
        if (match) {
          this.report("failed", "", me.nat, 0);
          this.update(ws, (a) => {
            a.match = null;
            if (!a.avoid.includes(match.opponent))
              a.avoid = [...a.avoid, match.opponent].slice(-MAX_AVOID);
            const requeues = (a.front?.key === match.key ? a.front.requeues : 0) + 1;
            a.front =
              requeues <= MAX_REQUEUES
                ? { key: match.key, since: match.since, until: Date.now() + MATCH_MS, requeues }
                : null;
          });
        } else if (me.room !== null) {
          await this.room(me.room).report(me.id, "failed", "", 0);
        }
        return;
      }
      case "relay.request": {
        const match = this.currentMatch(me);
        const allowed =
          match !== null
            ? match.side === 0
            : me.room !== null && (await this.room(me.room).canRelay(me.id));
        if (!allowed) {
          send(ws, { type: "error", message: "Only the host can ask for a relay." });
          return;
        }
        if (!(await this.countToday("relays", RELAY_DAILY))) {
          send(ws, { type: "error", message: "That's all the relayed games for today." });
          return;
        }
        const credentials = await relayCredentials(this.env);
        if (credentials === null) {
          send(ws, { type: "error", message: "There's no relay to fall back on yet." });
          return;
        }
        this.update(ws, (a) => (a.relayAt = Date.now()));
        send(ws, { type: "relay", ...credentials });
        return;
      }
      case "relay.ready": {
        // Only from a host just given relay credentials, so nobody can point
        // other games at an address of their choosing this way.
        if (Date.now() - me.relayAt > RELAY_TTL_S * 1000) return;
        if (splitAddr(message.addr) === null) return;
        const match = this.currentMatch(me);
        if (match) {
          await this.player(match.opponent).relayPeer(match.token, message.addr);
        } else if (me.room !== null) {
          await this.room(me.room).relayPeer(me.id, message.addr);
        }
        return;
      }
      case "relay.bytes": {
        if (this.currentMatch(me)) {
          this.env.MEET_EVENTS.writeDataPoint({
            blobs: ["relay-bytes", "relay", me.nat, "", "queue"],
            doubles: [1, 0, message.bytes],
            indexes: ["relay-bytes"],
          });
        } else if (me.room !== null) {
          await this.room(me.room).relayBytes(me.id, message.bytes);
        }
        return;
      }
    }
  }

  /** Waits in the queue for `mode` and this game's mods. */
  private async search(ws: WebSocket, mode: string): Promise<void> {
    const hello = await this.ctx.storage.get<Hello>("hello");
    const candidates = await this.ctx.storage.get<Candidate[]>("candidates");
    if (!hello || hello.version === "") {
      send(ws, { type: "error", message: "Update Direct connect to find a match." });
      return;
    }
    if (!candidates) {
      send(ws, { type: "error", message: "The game hasn't sent its addresses yet." });
      return;
    }
    await this.leaveAll(ws);
    const me = ws.deserializeAttachment() as Attachment;
    const key = await this.key(hello, mode);
    const now = Date.now();
    const front = me.front?.key === key && now < me.front.until ? me.front : null;
    const recent = await this.recent();
    // Before joining: the queue may pair this player, and call matched, before
    // join returns
    this.update(ws, (a) => (a.search = { key, mode }));
    const result = await this.queue(key).join(
      key,
      mode,
      {
        id: me.id,
        name: me.name,
        since: front ? front.since : now,
        lat: me.lat,
        lon: me.lon,
        nat: toNat(me.nat),
        mapped: candidates.some((c) => c.kind === "mapped"),
        avoid: me.avoid,
        recent,
        candidates,
      },
      hello.names
    );
    if (!result.ok) {
      this.update(ws, (a) => {
        if (a.search?.key === key) a.search = null;
      });
      send(ws, { type: "error", message: result.why });
      return;
    }
    this.update(ws, (a) => {
      if (!front) a.front = null;
      a.counts = { at: now, mode, label: result.label, searching: result.searching };
    });
    send(ws, { type: "searching", mode, label: result.label, searching: result.searching });
  }

  private async counts(ws: WebSocket, mode: string): Promise<void> {
    const me = ws.deserializeAttachment() as Attachment;
    const now = Date.now();
    if (me.counts && me.counts.mode === mode && now - me.counts.at < COUNTS_MS) {
      send(ws, { type: "counts", ...me.counts });
      return;
    }
    const hello = await this.ctx.storage.get<Hello>("hello");
    if (!hello || hello.version === "") return;
    const { label, searching } = await this.queue(await this.key(hello, mode)).count();
    this.update(ws, (a) => (a.counts = { at: now, mode, label, searching }));
    send(ws, { type: "counts", mode, label, searching });
  }

  private key(hello: Hello, mode: string): Promise<string> {
    return queueKey(mode, hello.version, hello.versions, hello.strict ? hello.all : null);
  }

  private currentMatch(me: Attachment): QueueMatch | null {
    return me.match && Date.now() - me.match.at < MATCH_MS ? me.match : null;
  }

  /** One Analytics Engine event per connection attempt of a queue match. */
  private report(outcome: string, how: string, nat: string, ms: number): void {
    this.env.MEET_EVENTS.writeDataPoint({
      blobs: [outcome, how, nat, "", "queue"],
      doubles: [1, ms],
      indexes: [outcome],
    });
  }

  private async recent(): Promise<string[]> {
    const list = (await this.ctx.storage.get<{ id: string; at: number }[]>("recent")) ?? [];
    const now = Date.now();
    return list.filter((r) => now - r.at < RECENT_MS).map((r) => r.id);
  }

  private async addRecent(id: string): Promise<void> {
    const now = Date.now();
    const list = (
      (await this.ctx.storage.get<{ id: string; at: number }[]>("recent")) ?? []
    ).filter((r) => r.id !== id && now - r.at < RECENT_MS);
    list.push({ id, at: now });
    await this.ctx.storage.put("recent", list.slice(-MAX_RECENT));
  }

  private async seat(me: Attachment): Promise<Seat> {
    const candidates = (await this.ctx.storage.get<Candidate[]>("candidates")) ?? null;
    return { id: me.id, name: me.name, candidates, nat: me.nat };
  }

  /** Counts one more `what` today for this account: false once `cap` is reached. */
  private async countToday(what: string, cap: number): Promise<boolean> {
    const key = `${what}:${new Date().toISOString().slice(0, 10)}`;
    const count = ((await this.ctx.storage.get<number>(key)) ?? 0) + 1;
    if (count > cap) return false;
    await this.ctx.storage.put(key, count);
    return true;
  }

  private room(code: string) {
    return this.env.ROOM.get(this.env.ROOM.idFromName(code));
  }

  private queue(key: string) {
    return this.env.QUEUE.get(this.env.QUEUE.idFromName(key));
  }

  private player(id: string) {
    return this.env.PLAYER.get(this.env.PLAYER.idFromName(id));
  }

  private update(ws: WebSocket, change: (a: Attachment) => void): void {
    const me = ws.deserializeAttachment() as Attachment;
    change(me);
    ws.serializeAttachment(me);
  }

  private async leaveAll(ws: WebSocket): Promise<void> {
    await this.leaveRoom(ws);
    await this.leaveQueue(ws);
  }

  private async leaveRoom(ws: WebSocket): Promise<void> {
    const me = ws.deserializeAttachment() as Attachment | null;
    if (!me || me.room === null) return;
    const code = me.room;
    this.update(ws, (a) => (a.room = null));
    await this.room(code).leave(me.id);
  }

  private async leaveQueue(ws: WebSocket): Promise<void> {
    const me = ws.deserializeAttachment() as Attachment | null;
    if (!me || me.search === null) return;
    const key = me.search.key;
    this.update(ws, (a) => (a.search = null));
    await this.queue(key).leave(me.id);
  }
}

function toNat(nat: string): Nat {
  return nat === "easy" || nat === "hard" ? nat : "unknown";
}

/** A latitude or longitude from Cloudflare, or null. */
function coordinate(text: string | null, limit: number): number | null {
  if (text === null || text === "") return null;
  const value = Number(text);
  return Number.isFinite(value) && Math.abs(value) <= limit ? value : null;
}

function send(ws: WebSocket, message: ServerMessage): void {
  try {
    ws.send(JSON.stringify(message));
  } catch {
    // Closed under us: nothing to tell.
  }
}
