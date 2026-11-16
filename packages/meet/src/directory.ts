import { DurableObject } from "cloudflare:workers";

/**
 * Every queue's count, for listing them (GET /v1/queues: the app's Find a
 * match screen, the site). One instance, "all". Each Queue DO tells it its
 * count at most every 10 seconds; a game asks its own queue directly.
 *
 * Limits: MAX_QUEUES rows; a row nobody searched in for STALE_MS goes; a
 * list is at most MAX_LIST rows.
 */

export const MAX_QUEUES = 2000;
export const STALE_MS = 10 * 60 * 1000;
export const MAX_LIST = 50;

export type QueueRow = {
  key: string;
  mode: string;
  label: string;
  searching: number;
  updated: number;
};

export class Directory extends DurableObject<MeetEnv> {
  private rows = new Map<string, QueueRow>();

  constructor(ctx: DurableObjectState, env: MeetEnv) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      const stored = await ctx.storage.list<QueueRow>({ prefix: "q:" });
      for (const row of stored.values()) this.rows.set(row.key, row);
    });
  }

  async update(key: string, mode: string, label: string, searching: number): Promise<void> {
    const now = Date.now();
    if (!this.rows.has(key) && this.rows.size >= MAX_QUEUES) {
      await this.prune(now);
      if (this.rows.size >= MAX_QUEUES) return;
    }
    const row = { key, mode, label, searching, updated: now };
    this.rows.set(key, row);
    await this.ctx.storage.put(`q:${key}`, row);
  }

  /** The busiest queues first, up to `limit` (at most MAX_LIST). */
  async list(limit: number): Promise<Omit<QueueRow, "key" | "updated">[]> {
    await this.prune(Date.now());
    return [...this.rows.values()]
      .filter((r) => r.searching > 0)
      .sort((a, b) => b.searching - a.searching || a.label.localeCompare(b.label))
      .slice(0, Math.max(0, Math.min(limit, MAX_LIST)))
      .map(({ mode, label, searching }) => ({ mode, label, searching }));
  }

  /** Drops rows of queues that went quiet: empty, or not heard from in
   * STALE_MS (a queue's searches end within that). */
  private async prune(now: number): Promise<void> {
    const gone: string[] = [];
    for (const row of this.rows.values()) {
      if (now - row.updated > STALE_MS || (row.searching === 0 && now - row.updated > 60_000)) {
        gone.push(row.key);
      }
    }
    for (const key of gone) this.rows.delete(key);
    // storage.delete takes at most 128 keys at a time
    for (let i = 0; i < gone.length; i += 128) {
      await this.ctx.storage.delete(gone.slice(i, i + 128).map((k) => `q:${k}`));
    }
  }
}
