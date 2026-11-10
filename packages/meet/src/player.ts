import { DurableObject } from "cloudflare:workers";
import type { Seat } from "./room";
import {
  type Candidate,
  checkCandidates,
  ClientMessage,
  JOIN_BUDGET,
  JOIN_WINDOW_MS,
  MAX_MESSAGE_BYTES,
  MESSAGE_BUDGET,
  MESSAGE_WINDOW_MS,
  normalizeCode,
  randomCode,
  type ServerMessage,
} from "./protocol";

/** What a connection remembers across hibernation. */
type Attachment = {
  id: string;
  name: string;
  /** The address the connection comes from. */
  ip: string;
  room: string | null;
  /** The last candidates the game sent, checked, for the rooms it joins. */
  candidates: Candidate[] | null;
  nat: string;
  messages: { start: number; count: number };
  joins: { start: number; count: number };
};

/** Codes tried before giving up on making a room. */
const CODE_ATTEMPTS = 5;

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
      await this.leaveRoom(old);
      old.close(4000, "Signed in somewhere else.");
    }

    const pair = new WebSocketPair();
    const attachment: Attachment = {
      id,
      name,
      ip,
      room: null,
      candidates: null,
      nat: "unknown",
      messages: { start: Date.now(), count: 0 },
      joins: { start: Date.now(), count: 0 },
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
      await this.leaveRoom(ws);
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
    await this.leaveRoom(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.leaveRoom(ws);
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

  private async handle(ws: WebSocket, me: Attachment, message: ClientMessage): Promise<void> {
    const member: Seat = { id: me.id, name: me.name, candidates: me.candidates, nat: me.nat };
    switch (message.type) {
      case "hello":
        return;
      case "room.make": {
        await this.leaveRoom(ws);
        for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
          const code = randomCode();
          if (await this.room(code).create(code, member, message.games)) {
            this.setRoom(ws, code);
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
        const code = normalizeCode(message.code);
        if (code === null) {
          send(ws, { type: "error", message: "Room codes are 6 letters and numbers." });
          return;
        }
        if (me.room === code) return;
        await this.leaveRoom(ws);
        const error = await this.room(code).join(member);
        if (error !== null) {
          send(ws, { type: "error", message: error });
          return;
        }
        this.setRoom(ws, code);
        return;
      }
      case "room.leave":
        await this.leaveRoom(ws);
        return;
      case "candidates": {
        me.candidates = checkCandidates(message.list, me.ip);
        me.nat = message.nat;
        ws.serializeAttachment(me);
        if (me.room !== null) await this.room(me.room).candidates(me.id, me.candidates, me.nat);
        return;
      }
      case "connected":
        if (me.room !== null)
          await this.room(me.room).report(me.id, "connected", message.how, message.ms);
        return;
      case "failed":
        if (me.room !== null) await this.room(me.room).report(me.id, "failed", "", 0);
        return;
    }
  }

  private room(code: string) {
    return this.env.ROOM.get(this.env.ROOM.idFromName(code));
  }

  private setRoom(ws: WebSocket, code: string | null): void {
    const me = ws.deserializeAttachment() as Attachment;
    me.room = code;
    ws.serializeAttachment(me);
  }

  private async leaveRoom(ws: WebSocket): Promise<void> {
    const me = ws.deserializeAttachment() as Attachment | null;
    if (!me || me.room === null) return;
    const code = me.room;
    this.setRoom(ws, null);
    await this.room(code).leave(me.id);
  }
}

function send(ws: WebSocket, message: ServerMessage): void {
  try {
    ws.send(JSON.stringify(message));
  } catch {
    // Closed under us: nothing to tell.
  }
}
