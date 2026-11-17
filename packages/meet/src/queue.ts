import { DurableObject } from "cloudflare:workers";
import { pairUp, type Waiter } from "./pairing";
import { type Candidate, randomToken } from "./protocol";

/**
 * A queue: everyone searching in one mode with the same gameplay mods. Its
 * name is queueKey(...), so a new mod set gets its own queue with nothing set
 * up. tgg-melee-goals/matchmaking.md, "Search and queues", is the design.
 *
 * Limits, all hard numbers:
 * - MAX_WAITING players at once; past that, joining says the queue is full.
 * - A search ends after SEARCH_MS.
 * - The alarm runs every TICK_MS at most, and only while two or more wait,
 *   a count is due to the Directory, or a search is about to end. After
 *   MAX_IDLE_TICKS ticks in a row without a pair, every search ends.
 * - The Directory hears this queue's count at most every DIRECTORY_MS.
 * - Making a pair sends to its two Player DOs and nothing else.
 */

export const MAX_WAITING = 512;
export const SEARCH_MS = 10 * 60 * 1000;
export const TICK_MS = 2000;
export const MAX_IDLE_TICKS = 1800;
export const DIRECTORY_MS = 10_000;
/** How long before asking the API to name the queue again after it couldn't. */
export const LABEL_RETRY_MS = 10 * 60 * 1000;

/** The queue for `mode` and a game's mods: 32 hex digits. */
export async function queueKey(
  mode: string,
  version: string,
  versions: string,
  all: string | null
): Promise<string> {
  const text = [mode, version, versions, all ?? ""].join("\n");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest).slice(0, 16), (b) =>
    b.toString(16).padStart(2, "0")
  ).join("");
}

export type Entry = Waiter & { candidates: Candidate[] };

/** What a Player DO hears when its player is paired. */
export type Matched = {
  key: string;
  mode: string;
  token: string;
  side: number;
  relay: boolean;
  /** When this player started searching, for going back to the front. */
  since: number;
  opponent: { id: string; name: string; candidates: Candidate[]; nat: string };
};

type Meta = {
  key: string;
  mode: string;
  label: string | null;
  labelTried: number;
  /** When the Directory last heard the count, and what it heard. */
  sentAt: number;
  sent: number;
  ticks: number;
};

export class Queue extends DurableObject<MeetEnv> {
  private entries = new Map<string, Entry>();
  private meta: Meta | null = null;

  constructor(ctx: DurableObjectState, env: MeetEnv) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.meta = (await ctx.storage.get<Meta>("meta")) ?? null;
      const stored = await ctx.storage.list<Entry>({ prefix: "w:" });
      for (const entry of stored.values()) this.entries.set(entry.id, entry);
    });
  }

  /** Waits in the queue: its name and how many are searching, or why not. */
  async join(
    key: string,
    mode: string,
    entry: Entry,
    names: string
  ): Promise<{ ok: true; label: string; searching: number } | { ok: false; why: string }> {
    const meta = (this.meta ??= {
      key,
      mode,
      label: null,
      labelTried: 0,
      sentAt: 0,
      sent: -1,
      ticks: 0,
    });
    if (!this.entries.has(entry.id) && this.entries.size >= MAX_WAITING) {
      return { ok: false, why: "This queue is full. Try again in a minute." };
    }
    this.entries.set(entry.id, entry);
    await this.ctx.storage.put(`w:${entry.id}`, entry);
    if (meta.label === null && Date.now() - meta.labelTried > LABEL_RETRY_MS) {
      meta.labelTried = Date.now();
      meta.label = await this.nameQueue(names);
    }
    await this.pair();
    await this.save();
    return { ok: true, label: this.label(), searching: this.entries.size };
  }

  async leave(id: string): Promise<void> {
    if (!this.entries.delete(id)) return;
    await this.ctx.storage.delete(`w:${id}`);
    await this.save();
  }

  count(): { label: string; searching: number } {
    return { label: this.label(), searching: this.entries.size };
  }

  async alarm(): Promise<void> {
    const meta = this.meta;
    if (!meta) return;
    const now = Date.now();
    const ended: Entry[] = [];
    for (const entry of this.entries.values()) {
      if (now - entry.since >= SEARCH_MS) ended.push(entry);
    }
    if (this.entries.size >= 2) meta.ticks++;
    const tooLong = meta.ticks > MAX_IDLE_TICKS;
    if (tooLong) {
      ended.splice(0, ended.length, ...this.entries.values());
      meta.ticks = 0;
    }
    for (const entry of ended) {
      this.entries.delete(entry.id);
      await this.ctx.storage.delete(`w:${entry.id}`);
    }
    await Promise.all(
      ended.map((e) =>
        this.player(e.id).searchEnded(meta.key, "Nobody to play right now. Try again later.")
      )
    );
    await this.pair();
    await this.save();
  }

  private label(): string {
    return this.meta?.label ?? "These mods";
  }

  /** A name for the queue from the registry's sets ("Competitive"); null when
   * the API can't say. Cosmetic: it's what the game and the app show. */
  private async nameQueue(names: string): Promise<string | null> {
    try {
      return await this.env.API.queueLabel(names);
    } catch (error) {
      console.error("queue label", error);
      return null;
    }
  }

  /** Makes every pair it can, and tells each pair's games. */
  private async pair(): Promise<void> {
    const meta = this.meta;
    if (!meta || this.entries.size < 2) return;
    const pairs = pairUp([...this.entries.values()], Date.now());
    if (pairs.length === 0) return;
    meta.ticks = 0;
    for (const { host, joiner } of pairs) {
      this.entries.delete(host.id);
      this.entries.delete(joiner.id);
    }
    const keys = pairs.flatMap((p) => [`w:${p.host.id}`, `w:${p.joiner.id}`]);
    // storage.delete takes at most 128 keys at a time
    for (let i = 0; i < keys.length; i += 128)
      await this.ctx.storage.delete(keys.slice(i, i + 128));
    await Promise.all(
      pairs.flatMap(({ host, joiner, relay }) => {
        const token = randomToken();
        const told = (me: Waiter, side: number, other: Waiter): Matched => ({
          key: meta.key,
          mode: meta.mode,
          token,
          side,
          relay,
          since: me.since,
          opponent: {
            id: other.id,
            name: other.name,
            candidates: (other as Entry).candidates,
            nat: other.nat,
          },
        });
        return [
          this.player(host.id).matched(told(host, 0, joiner)),
          this.player(joiner.id).matched(told(joiner, 1, host)),
        ];
      })
    );
  }

  /** Saves, tells the Directory when its count is due, and sets the alarm. */
  private async save(): Promise<void> {
    const meta = this.meta;
    if (!meta) return;
    const now = Date.now();
    const searching = this.entries.size;
    if (searching !== meta.sent && now - meta.sentAt >= DIRECTORY_MS) {
      meta.sent = searching;
      meta.sentAt = now;
      try {
        await this.directory().update(meta.key, meta.mode, this.label(), searching);
      } catch (error) {
        console.error("directory", error);
      }
    }
    await this.ctx.storage.put("meta", meta);

    let next = Infinity;
    if (searching >= 2) next = now + TICK_MS;
    if (searching !== meta.sent) next = Math.min(next, meta.sentAt + DIRECTORY_MS);
    for (const entry of this.entries.values()) next = Math.min(next, entry.since + SEARCH_MS);
    if (next === Infinity) {
      await this.ctx.storage.deleteAlarm();
    } else {
      await this.ctx.storage.setAlarm(Math.max(next, now + TICK_MS));
    }
  }

  private player(id: string) {
    return this.env.PLAYER.get(this.env.PLAYER.idFromName(id));
  }

  private directory() {
    return this.env.DIRECTORY.get(this.env.DIRECTORY.idFromName("all"));
  }
}
