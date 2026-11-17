import { DurableObject } from "cloudflare:workers";
import {
  MeetMode,
  MeetModNames,
  MeetQueueInfo,
  MeetQueueLabel,
  MeetQueueMods,
  MeetQueueSet,
} from "@vgskins/shared/meet";
import { z } from "zod";
import { pairUp, Waiter } from "./pairing";
import { Candidates, Member, Nat, randomToken } from "./protocol";

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
 * - The API is asked the queue's name at most every LABEL_RETRY_MS, on a join.
 */

export const MAX_WAITING = 512;
export const SEARCH_MS = 10 * 60 * 1000;
export const TICK_MS = 2000;
export const MAX_IDLE_TICKS = 1800;
export const DIRECTORY_MS = 10_000;
/** How long before asking the API about the queue again: its name, set and mods. */
export const LABEL_RETRY_MS = 10 * 60 * 1000;
/** What a queue is called while the API can't name it. */
export const UNNAMED = "These mods";
/** storage.delete takes at most this many keys at a time. */
export const DELETE_BATCH = 128;

/** A queue's name: 32 hex digits. */
export const QueueKey = z.string().regex(/^[0-9a-f]{32}$/);

/** The queue for `mode` and a game's mods. */
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

/** A player waiting, with the addresses the other game will punch to. */
export const Entry = Waiter.extend({ candidates: Candidates });
export type Entry = z.infer<typeof Entry>;

/** Player DO -> Queue: wait here. */
export const JoinRequest = z.object({
  key: QueueKey,
  mode: MeetMode,
  entry: Entry,
  names: MeetModNames,
});
export type JoinRequest = z.infer<typeof JoinRequest>;

/** The queue's name and how many are searching in it. */
export const QueueCount = z.object({ label: MeetQueueLabel, searching: z.number().int().min(0) });
export type QueueCount = z.infer<typeof QueueCount>;

/** Queue -> Player DO: the answer to a join. */
export const JoinResult = z.discriminatedUnion("ok", [
  QueueCount.extend({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), why: z.string() }),
]);
export type JoinResult = z.infer<typeof JoinResult>;

/** Queue -> Player DO: its player is paired. */
export const Matched = z.object({
  key: QueueKey,
  mode: MeetMode,
  token: z.string(),
  side: z.number().int().min(0).max(1),
  relay: z.boolean(),
  /** When this player started searching, for going back to the front. */
  since: z.number(),
  opponent: Member.extend({ candidates: Candidates, nat: Nat }),
});
export type Matched = z.infer<typeof Matched>;

/** Queue -> Player DO: its player's search is over. */
export const SearchEnded = z.object({ key: QueueKey, why: z.string() });
export type SearchEnded = z.infer<typeof SearchEnded>;

const Meta = z.object({
  key: QueueKey,
  mode: MeetMode,
  label: MeetQueueLabel.nullable(),
  labelTried: z.number(),
  /** The standing queue's set, and the mods, as the API named them. */
  set: MeetQueueSet.nullable().default(null),
  mods: MeetQueueMods.default([]),
  /** When the Directory last heard the count, and what it heard. */
  sentAt: z.number(),
  sent: z.number().int(),
  ticks: z.number().int().min(0),
});
type Meta = z.infer<typeof Meta>;

export class Queue extends DurableObject<MeetEnv> {
  private entries = new Map<string, Entry>();
  private meta: Meta | null = null;

  constructor(ctx: DurableObjectState, env: MeetEnv) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      const meta = Meta.safeParse(await ctx.storage.get("meta"));
      this.meta = meta.success ? meta.data : null;
      const stored = await ctx.storage.list({ prefix: "w:" });
      for (const value of stored.values()) {
        const entry = Entry.safeParse(value);
        if (entry.success) this.entries.set(entry.data.id, entry.data);
      }
    });
  }

  /** Waits in the queue: its name and how many are searching, or why not. */
  async join(input: JoinRequest): Promise<JoinResult> {
    const { key, mode, entry, names } = JoinRequest.parse(input);
    const meta = (this.meta ??= {
      key,
      mode,
      label: null,
      labelTried: 0,
      set: null,
      mods: [],
      sentAt: 0,
      sent: -1,
      ticks: 0,
    });
    if (!this.entries.has(entry.id) && this.entries.size >= MAX_WAITING) {
      return { ok: false, why: "This queue is full. Try again in a minute." };
    }
    this.entries.set(entry.id, entry);
    await this.ctx.storage.put(`w:${entry.id}`, entry);
    // Asked again now and then, so a set marked as a queue later is picked up.
    if (Date.now() - meta.labelTried > LABEL_RETRY_MS) {
      meta.labelTried = Date.now();
      const info = await this.nameQueue(names);
      if (info) {
        meta.label = info.label;
        meta.set = info.set;
        meta.mods = info.mods;
      }
    }
    await this.pair();
    await this.save();
    return { ok: true, ...this.count() };
  }

  async leave(input: string): Promise<void> {
    const id = Member.shape.id.parse(input);
    if (!this.entries.delete(id)) return;
    await this.ctx.storage.delete(`w:${id}`);
    await this.save();
  }

  count(): QueueCount {
    return { label: this.meta?.label ?? UNNAMED, searching: this.entries.size };
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
    if (meta.ticks > MAX_IDLE_TICKS) {
      ended.splice(0, ended.length, ...this.entries.values());
      meta.ticks = 0;
    }
    for (const entry of ended) this.entries.delete(entry.id);
    await this.deleteEntries(ended.map((e) => e.id));
    await Promise.all(
      ended.map((e) =>
        this.player(e.id).searchEnded({
          key: meta.key,
          why: "Nobody to play right now. Try again later.",
        })
      )
    );
    await this.pair();
    await this.save();
  }

  /** A name for the queue from the registry's sets ("Competitive"), the
   * standing queue's set when it is one, and its mods; null when the API
   * can't say. It's what the game and the queue list show. */
  private async nameQueue(names: string): Promise<MeetQueueInfo> {
    try {
      const info = MeetQueueInfo.safeParse(await this.env.API.queueInfo({ names }));
      if (!info.success) console.error("queue info", info.error.issues[0]);
      return info.success ? info.data : null;
    } catch (error) {
      console.error("queue info", error);
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
    const tellAll: (() => Promise<boolean>)[] = [];
    for (const { host, joiner, relay } of pairs) {
      const a = this.entries.get(host.id);
      const b = this.entries.get(joiner.id);
      this.entries.delete(host.id);
      this.entries.delete(joiner.id);
      if (!a || !b) continue;
      const token = randomToken();
      const tell = (me: Entry, side: number, other: Entry): Matched => ({
        key: meta.key,
        mode: meta.mode,
        token,
        side,
        relay,
        since: me.since,
        opponent: { id: other.id, name: other.name, candidates: other.candidates, nat: other.nat },
      });
      tellAll.push(
        () => this.player(a.id).matched(tell(a, 0, b)),
        () => this.player(b.id).matched(tell(b, 1, a))
      );
    }
    await this.deleteEntries(pairs.flatMap((p) => [p.host.id, p.joiner.id]));
    await Promise.all(tellAll.map((t) => t()));
  }

  private async deleteEntries(ids: string[]): Promise<void> {
    for (let i = 0; i < ids.length; i += DELETE_BATCH) {
      await this.ctx.storage.delete(ids.slice(i, i + DELETE_BATCH).map((id) => `w:${id}`));
    }
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
        await this.directory().update({
          key: meta.key,
          mode: meta.mode,
          set: meta.set,
          mods: meta.mods,
          ...this.count(),
        });
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
