import { env, runDurableObjectAlarm, SELF } from "cloudflare:test";
import { MEET_MAX_GAMES } from "@vgskins/shared/meet";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ROOM_MAX_MS, ServerMessage } from "./protocol";

/** Moves the clock `ms` on, for every DO too, until the test ends. */
function later(ms: number) {
  vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + ms });
}

afterEach(() => {
  vi.useRealTimers();
});

// Fake games on the meeting point, a WebSocket each, making and joining rooms
// of two to four.

type Message = ServerMessage;
type Meet = Extract<Message, { type: "meet" }>;
type Roster = Extract<Message, { type: "room" }>;

class Game {
  messages: Message[] = [];
  private waiters: (() => void)[] = [];

  constructor(
    readonly name: string,
    readonly ws: WebSocket
  ) {
    ws.addEventListener("message", (event) => {
      this.messages.push(ServerMessage.parse(JSON.parse(String(event.data))));
      for (const wake of this.waiters.splice(0)) wake();
    });
  }

  static async open(name: string): Promise<Game> {
    const res = await SELF.fetch(`http://meet.test/v1?ticket=dev:${name}`, {
      headers: { Upgrade: "websocket" },
    });
    const ws = res.webSocket;
    if (!ws) throw new Error(`no socket: ${res.status} ${await res.text()}`);
    ws.accept();
    const game = new Game(name, ws);
    await game.next("welcome");
    return game;
  }

  send(message: object) {
    this.ws.send(JSON.stringify(message));
  }

  /** Sends this game's one address; `port` tells sessions apart. */
  candidates(port = 51000) {
    this.send({
      type: "candidates",
      list: [{ addr: `192.168.1.${this.name.length}:${port}`, kind: "local" }],
      nat: "easy",
    });
  }

  async next(type: Message["type"], ms = 3000): Promise<Message> {
    const end = Date.now() + ms;
    for (;;) {
      const i = this.messages.findIndex((m) => m.type === type);
      if (i >= 0) return this.messages.splice(i, 1)[0];
      if (Date.now() > end) {
        throw new Error(`${this.name}: no ${type} (had ${JSON.stringify(this.messages)})`);
      }
      await new Promise<void>((wake) => {
        this.waiters.push(wake);
        setTimeout(wake, 50);
      });
    }
  }

  async meet(): Promise<Meet> {
    const m = await this.next("meet");
    if (m.type !== "meet") throw new Error(`${this.name}: ${m.type} for a meet`);
    return m;
  }

  /** The newest roster, after the room settles. */
  async roster(): Promise<Roster> {
    await settle();
    const rosters = this.messages.filter((m): m is Roster => m.type === "room");
    this.messages = this.messages.filter((m) => m.type !== "room");
    const last = rosters.at(-1);
    if (!last) throw new Error(`${this.name}: no roster`);
    return last;
  }

  /** The text of the next error. */
  async error(): Promise<string> {
    const m = await this.next("error");
    return m.type === "error" ? m.message : "";
  }

  has(type: Message["type"]) {
    return this.messages.some((m) => m.type === type);
  }

  close() {
    this.ws.close(1000, "done");
  }
}

const settle = () => new Promise((r) => setTimeout(r, 150));

/** A host with its room made and its candidates sent: the room's code. */
// What the game asks for: as many as its netplay carries (4 today)
async function makeRoom(host: Game, games = 4): Promise<string> {
  host.candidates();
  host.send({ type: "room.make", games });
  const roster = await host.next("room");
  if (roster.type !== "room") throw new Error("no room");
  return roster.code;
}

/** Joins `code`, candidates sent first, and takes the meet it brings. */
async function join(game: Game, code: string): Promise<Meet> {
  game.candidates();
  game.send({ type: "room.join", code });
  return game.meet();
}

describe("a room", () => {
  it("of two meets its two games, as before", async () => {
    const host = await Game.open("hana");
    const code = await makeRoom(host, 2);
    const guest = await Game.open("gil");
    const theirs = await join(guest, code);
    const mine = await host.meet();
    expect(mine.token).toBe(theirs.token);
    expect(mine.side).toBe(0);
    expect(mine.peers.map((p) => p.name)).toEqual(["gil"]);
    expect(theirs.side).toBe(1);
    expect(theirs.peers.map((p) => p.name)).toEqual(["hana"]);

    const third = await Game.open("tess");
    third.send({ type: "room.join", code });
    expect(await third.error()).toBe("That room is full.");
    for (const g of [host, guest, third]) g.close();
  });

  it("of four meets each joiner with the host as it arrives, and refuses a fifth", async () => {
    const host = await Game.open("hugo");
    const code = await makeRoom(host);
    const names = ["ann", "ben", "cy"];
    const guests: Game[] = [];
    let token = "";
    for (const [i, name] of names.entries()) {
      const g = await Game.open(name);
      guests.push(g);
      const theirs = await join(g, code);
      const mine = await host.meet();
      // One session on the host, so one token for all of them
      token ||= mine.token;
      expect(mine.token).toBe(token);
      expect(theirs.token).toBe(token);
      expect(mine.peers.map((p) => p.name)).toEqual([name]);
      expect(theirs.side).toBe(i + 1);
      // A joiner meets only the host: netplay is a star through it
      expect(theirs.peers.map((p) => p.name)).toEqual(["hugo"]);
    }
    const roster = await host.roster();
    expect(roster.members).toEqual(["hugo", "ann", "ben", "cy"]);
    expect(roster.games).toBe(4);
    // Nobody already met is met again
    for (const g of guests) expect(g.has("meet")).toBe(false);

    const fifth = await Game.open("eve");
    fifth.send({ type: "room.join", code });
    expect(await fifth.error()).toBe("That room is full.");
    for (const g of [host, ...guests, fifth]) g.close();
  });

  it("of three takes a joiner who left and came back, and closes when the host leaves", async () => {
    const host = await Game.open("hal");
    const code = await makeRoom(host, 3);
    const a = await Game.open("amy");
    const b = await Game.open("bo");
    await join(a, code);
    await host.meet();
    await join(b, code);
    await host.meet();

    // amy restarts into the host's mods: her socket closes, then she's back
    a.close();
    expect((await host.roster()).members).toEqual(["hal", "bo"]);
    const back = await Game.open("amy");
    const again = await join(back, code);
    expect(again.peers.map((p) => p.name)).toEqual(["hal"]);
    expect((await host.meet()).peers.map((p) => p.name)).toEqual(["amy"]);
    expect((await host.roster()).members).toEqual(["hal", "bo", "amy"]);

    host.send({ type: "room.leave" });
    for (const g of [back, b]) {
      const closed = await g.next("closed");
      expect(closed.type === "closed" && closed.why).toBe("The host left the room.");
    }
    const late = await Game.open("lu");
    late.send({ type: "room.join", code });
    expect(await late.error()).toBe("There's no room with that code.");
    for (const g of [host, back, b, late]) g.close();
  });

  it("refuses new players once the host is playing, until the host's next session", async () => {
    const host = await Game.open("hope");
    const code = await makeRoom(host);
    const a = await Game.open("abe");
    const firstMeet = await join(a, code);
    await host.meet();
    host.send({ type: "room.lock" });
    expect((await a.roster()).locked).toBe(true);

    const late = await Game.open("lia");
    late.candidates();
    late.send({ type: "room.join", code });
    expect(await late.error()).toBe("That room is already playing.");

    // A joiner can't lock it
    a.send({ type: "room.lock" });
    // The session ended (abe's friend dropped): the host's new candidates
    // reopen the room and meet abe again on a new token
    host.candidates(51001);
    const rejoin = await a.meet();
    expect(rejoin.token).not.toBe(firstMeet.token);
    expect((await host.meet()).token).toBe(rejoin.token);
    expect((await host.roster()).locked).toBe(false);
    late.send({ type: "room.join", code });
    expect((await late.meet()).token).toBe(rejoin.token);
    for (const g of [host, a, late]) g.close();
  });

  it("meets a joiner again on its new candidates, without the others", async () => {
    const host = await Game.open("hux");
    const code = await makeRoom(host);
    const a = await Game.open("ada");
    const b = await Game.open("bea");
    const first = await join(a, code);
    await host.meet();
    await join(b, code);
    await host.meet();
    a.candidates(51002);
    const again = await a.meet();
    expect(again.token).toBe(first.token);
    expect((await host.meet()).peers.map((p) => p.name)).toEqual(["ada"]);
    await settle();
    expect(b.has("meet")).toBe(false);
    for (const g of [host, a, b]) g.close();
  });

  it("takes the size the game asks for, up to the meeting point's ceiling", async () => {
    const unknown = "The game sent something the meeting point doesn't know.";
    const host = await Game.open("hy");
    for (const games of [MEET_MAX_GAMES + 1, 1]) {
      host.send({ type: "room.make", games });
      expect(await host.error()).toBe(unknown);
    }
    // The size is the game's to say: a message without one isn't a room
    host.send({ type: "room.make" });
    expect(await host.error()).toBe(unknown);
    host.send({ type: "room.make", games: MEET_MAX_GAMES });
    const roster = await host.next("room");
    expect(roster.type === "room" && roster.games).toBe(MEET_MAX_GAMES);
    host.close();
  });

  it("stays open past 30 idle minutes while its host is in it", async () => {
    const host = await Game.open("hil");
    const code = await makeRoom(host);
    const stub = env.ROOM.get(env.ROOM.idFromName(code));
    // Playing for a while: nothing reached the room, but the host is still there
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    await settle();
    expect(host.has("closed")).toBe(false);

    host.close();
  });

  it("closes after 12 hours however busy", async () => {
    const host = await Game.open("hen");
    const code = await makeRoom(host);
    later(ROOM_MAX_MS);
    const stub = env.ROOM.get(env.ROOM.idFromName(code));
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    const closed = await host.next("closed");
    expect(closed.type === "closed" && closed.why).toBe("The room closed after 12 hours.");
    host.close();
  });
});
