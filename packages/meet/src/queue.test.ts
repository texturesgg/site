import { env, runDurableObjectAlarm, runInDurableObject, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { HARD_PAIR_AFTER_MS, RING_AFTER_MS } from "./pairing";
import type { Entry, Queue } from "./queue";
import { queueKey, SEARCH_MS } from "./queue";

// Fake games on the meeting point: a WebSocket each, signed in with a
// development ticket, from a fake place.
const PLACES = {
  chicago: ["41.88", "-87.63"],
  detroit: ["42.33", "-83.05"],
  la: ["34.05", "-118.24"],
} as const;

type Message = { type: string; [key: string]: unknown };

class Game {
  messages: Message[] = [];
  private waiters: (() => void)[] = [];

  constructor(
    readonly name: string,
    readonly ws: WebSocket
  ) {
    ws.addEventListener("message", (event) => {
      this.messages.push(JSON.parse(event.data as string));
      for (const wake of this.waiters.splice(0)) wake();
    });
  }

  static async open(name: string, place: keyof typeof PLACES = "chicago"): Promise<Game> {
    const [latitude, longitude] = PLACES[place];
    const res = await SELF.fetch(`http://meet.test/v1?ticket=dev:${name}`, {
      headers: { Upgrade: "websocket" },
      cf: { latitude, longitude },
    } as RequestInit);
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

  /** Says hello with these mods and offers one address. */
  ready(versions = "aaaaaaaaaaaaaaaa", nat = "easy") {
    this.send({
      type: "hello",
      game: "tgg-melee 0.1.0 linux",
      target: "linux-x86_64",
      versions,
      version: "0.1.0",
      all: "",
      strict: false,
      names: "tgg.netplay 0.10.0, tgg.direct-connect 0.6.0",
    });
    this.send({
      type: "candidates",
      list: [{ addr: `192.168.1.${this.name.length}:51000`, kind: "local" }],
      nat,
    });
  }

  /** The first message of `type` not read yet (it's taken). */
  async next(type: string, ms = 3000): Promise<Message> {
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

  has(type: string) {
    return this.messages.some((m) => m.type === type);
  }

  async search(mode = "vs") {
    this.send({ type: "search", mode });
    return this.next("searching");
  }

  close() {
    this.ws.close(1000, "done");
  }
}

const settle = () => new Promise((r) => setTimeout(r, 150));

async function queueOf(versions = "aaaaaaaaaaaaaaaa", mode = "vs") {
  return env.QUEUE.get(env.QUEUE.idFromName(await queueKey(mode, "0.1.0", versions, null)));
}

/** Makes everyone in a queue look like they started searching `ms` earlier. */
async function backdate(stub: DurableObjectStub<Queue>, ms: number) {
  await runInDurableObject(stub, async (queue: Queue, state) => {
    const entries = (queue as unknown as { entries: Map<string, Entry> }).entries;
    for (const entry of entries.values()) {
      entry.since -= ms;
      await state.storage.put(`w:${entry.id}`, entry);
    }
  });
}

describe("a queue", () => {
  it("pairs two games with the same mods", async () => {
    const a = await Game.open("alice");
    const b = await Game.open("bob");
    a.ready();
    b.ready();
    expect(await a.search()).toMatchObject({ mode: "vs", searching: 1, label: "These mods" });
    await b.search();
    const ma = await a.next("meet");
    const mb = await b.next("meet");
    expect(ma.token).toBe(mb.token);
    expect([ma.side, mb.side].sort()).toEqual([0, 1]);
    expect(ma.queue).toEqual({ mode: "vs", relay: false });
    expect(ma.peers).toEqual([
      {
        side: mb.side,
        name: "bob",
        nat: "easy",
        candidates: [{ addr: "192.168.1.3:51000", kind: "local" }],
      },
    ]);
    a.close();
    b.close();
  });

  it("never pairs across mod sets or modes, and four games pair by set", async () => {
    const games = await Promise.all(["s1a", "s2a", "s1b", "s2b", "mode"].map((n) => Game.open(n)));
    const [s1a, s2a, s1b, s2b, other] = games;
    s1a.ready("1111111111111111");
    s1b.ready("1111111111111111");
    s2a.ready("2222222222222222");
    s2b.ready("2222222222222222");
    other.ready("1111111111111111");
    await s1a.search();
    await s2a.search();
    await other.search("main/first-to-3");
    await settle();
    expect(games.some((g) => g.has("meet"))).toBe(false);
    await s1b.search();
    await s2b.search();
    const peer = async (g: Game) => ((await g.next("meet")).peers as { name: string }[])[0].name;
    expect(await peer(s1a)).toBe("s1b");
    expect(await peer(s1b)).toBe("s1a");
    expect(await peer(s2a)).toBe("s2b");
    expect(await peer(s2b)).toBe("s2a");
    await settle();
    expect(other.has("meet")).toBe(false);
    for (const g of games) g.close();
  });

  it("counts who's searching, and leaving is clean", async () => {
    const a = await Game.open("counter-a");
    const b = await Game.open("counter-b");
    a.ready("cccccccccccccccc");
    b.ready("cccccccccccccccc");
    b.send({ type: "counts", mode: "vs" });
    expect(await b.next("counts")).toMatchObject({ searching: 0 });
    await a.search();
    // Asked again within 15 s: the same answer, without asking the queue
    b.send({ type: "counts", mode: "vs" });
    expect(await b.next("counts")).toMatchObject({ searching: 0 });
    expect(await (await queueOf("cccccccccccccccc")).count()).toMatchObject({ searching: 1 });
    a.send({ type: "search.stop" });
    await settle();
    expect(await (await queueOf("cccccccccccccccc")).count()).toMatchObject({ searching: 0 });
    await a.search();
    a.close();
    await settle();
    expect(await (await queueOf("cccccccccccccccc")).count()).toMatchObject({ searching: 0 });
    b.close();
  });

  it("puts both back at the front after a failed match, and never pairs them again", async () => {
    const v = "ffffffffffffffff";
    const a = await Game.open("fail-a");
    const b = await Game.open("fail-b");
    a.ready(v);
    b.ready(v);
    await a.search();
    await b.search();
    await a.next("meet");
    await b.next("meet");
    a.send({ type: "failed", why: "no answer" });
    b.send({ type: "failed", why: "no answer" });
    await settle();
    await a.search();
    await b.search();
    await settle();
    expect(a.has("meet") || b.has("meet")).toBe(false);
    // Someone new: the front of the queue (fail-a, who searched first) gets them
    const c = await Game.open("fail-c");
    c.ready(v);
    await c.search();
    const peer = ((await a.next("meet")).peers as { name: string }[])[0].name;
    expect(peer).toBe("fail-c");
    for (const g of [a, b, c]) g.close();
  });

  it("widens from nearby to far with time", async () => {
    const v = "dddddddddddddddd";
    const chi = await Game.open("wide-chi", "chicago");
    const la = await Game.open("wide-la", "la");
    chi.ready(v);
    la.ready(v);
    await chi.search();
    await la.search();
    const stub = await queueOf(v);
    await runDurableObjectAlarm(stub);
    await settle();
    expect(chi.has("meet")).toBe(false);
    await backdate(stub, RING_AFTER_MS[1]);
    await runDurableObjectAlarm(stub);
    await chi.next("meet");
    await la.next("meet");
    chi.close();
    la.close();
  });

  it("holds back the last opponent while someone else is near", async () => {
    const v = "eeeeeeeeeeeeeeee";
    const a = await Game.open("re-a", "chicago");
    const b = await Game.open("re-b", "chicago");
    a.ready(v);
    b.ready(v);
    await a.search();
    await b.search();
    await a.next("meet");
    await b.next("meet");
    // They played; both search again, alone in the queue
    await a.search();
    await b.search();
    await settle();
    expect(a.has("meet")).toBe(false);
    const c = await Game.open("re-c", "detroit");
    c.ready(v);
    await c.search();
    expect(((await a.next("meet")).peers as { name: string }[])[0].name).toBe("re-c");
    // b is alone: after REMATCH_AFTER_MS with nobody else, d is fine, and
    // so would a rematch be
    for (const g of [a, b, c]) g.close();
  });

  it("pairs two hard routers only after a minute, straight to the relay", async () => {
    const v = "9999999999999999";
    const a = await Game.open("hard-a");
    const b = await Game.open("hard-b");
    a.ready(v, "hard");
    b.ready(v, "hard");
    await a.search();
    await b.search();
    await settle();
    expect(a.has("meet")).toBe(false);
    const stub = await queueOf(v);
    await backdate(stub, HARD_PAIR_AFTER_MS);
    await runDurableObjectAlarm(stub);
    expect((await a.next("meet")).queue).toEqual({ mode: "vs", relay: true });
    a.close();
    b.close();
  });

  it("ends a search after ten minutes", async () => {
    const v = "8888888888888888";
    const a = await Game.open("old-a");
    a.ready(v);
    await a.search();
    const stub = await queueOf(v);
    await backdate(stub, SEARCH_MS);
    await runDurableObjectAlarm(stub);
    expect(await a.next("search.ended")).toMatchObject({
      why: "Nobody to play right now. Try again later.",
    });
    expect(await stub.count()).toMatchObject({ searching: 0 });
    a.close();
  });

  it("takes its name from the registry", async () => {
    const a = await Game.open("named");
    a.ready("6666666666666666");
    a.send({
      type: "hello",
      game: "g",
      target: "t",
      versions: "6666666666666666",
      version: "0.1.0",
      names: "tgg.competitive-rules 1.0.0",
    });
    expect(await a.search()).toMatchObject({ label: "Competitive" });
    a.close();
  });

  it("refuses a search before the game says which mods it has", async () => {
    const a = await Game.open("early");
    a.send({ type: "search", mode: "vs" });
    expect(await a.next("error")).toMatchObject({
      message: "Update Direct connect to find a match.",
    });
    a.close();
  });
});

describe("the list of queues", () => {
  it("lists busy queues for an app", async () => {
    const a = await Game.open("listed");
    a.ready("7777777777777777");
    await a.search();
    await settle();
    const res = await SELF.fetch("http://meet.test/v1/queues");
    const body = (await res.json()) as {
      queues: { mode: string; label: string; searching: number }[];
    };
    expect(body.queues).toContainEqual({ mode: "vs", label: "These mods", searching: 1 });
    a.close();
  });
});
