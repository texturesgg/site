import { DurableObject } from "cloudflare:workers";
import { MEET_QUEUES_MAX, MeetQueueSummary } from "@vgskins/shared/meet";
import { z } from "zod";
import { DELETE_BATCH, QueueKey } from "./queue";

/**
 * Every queue's count, for listing them (GET /v1/queues: the app's Find a
 * match screen, the site). One instance, "all". Each Queue DO tells it its
 * count at most every 10 seconds; a game asks its own queue directly.
 *
 * Limits: MAX_QUEUES rows; a row nobody searched in for STALE_MS goes; a
 * list is at most MEET_QUEUES_MAX rows.
 */

export const MAX_QUEUES = 2000;
export const STALE_MS = 10 * 60 * 1000;
/** An empty queue's row goes after this long. */
export const EMPTY_MS = 60_000;

/** Queue -> Directory: a queue's count. */
export const QueueUpdate = MeetQueueSummary.extend({ key: QueueKey });
export type QueueUpdate = z.infer<typeof QueueUpdate>;

const QueueRow = QueueUpdate.extend({ updated: z.number() });
type QueueRow = z.infer<typeof QueueRow>;

const ListLimit = z.number().int().min(1).max(MEET_QUEUES_MAX);

export class Directory extends DurableObject<MeetEnv> {
  private rows = new Map<string, QueueRow>();

  constructor(ctx: DurableObjectState, env: MeetEnv) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      const stored = await ctx.storage.list({ prefix: "q:" });
      for (const value of stored.values()) {
        const row = QueueRow.safeParse(value);
        if (row.success) this.rows.set(row.data.key, row.data);
      }
    });
  }

  async update(input: QueueUpdate): Promise<void> {
    const update = QueueUpdate.parse(input);
    const now = Date.now();
    if (!this.rows.has(update.key) && this.rows.size >= MAX_QUEUES) {
      await this.prune(now);
      if (this.rows.size >= MAX_QUEUES) return;
    }
    const row: QueueRow = { ...update, updated: now };
    this.rows.set(row.key, row);
    await this.ctx.storage.put(`q:${row.key}`, row);
  }

  /** The busiest queues first, up to `limit`. */
  async list(input: number): Promise<MeetQueueSummary[]> {
    const limit = ListLimit.parse(input);
    await this.prune(Date.now());
    return [...this.rows.values()]
      .filter((r) => r.searching > 0)
      .sort((a, b) => b.searching - a.searching || a.label.localeCompare(b.label))
      .slice(0, limit)
      .map(({ mode, label, searching }) => ({ mode, label, searching }));
  }

  /** Drops rows of queues that went quiet: empty, or not heard from in
   * STALE_MS (a queue's searches end within that). */
  private async prune(now: number): Promise<void> {
    const gone: string[] = [];
    for (const row of this.rows.values()) {
      if (now - row.updated > STALE_MS || (row.searching === 0 && now - row.updated > EMPTY_MS)) {
        gone.push(row.key);
      }
    }
    for (const key of gone) this.rows.delete(key);
    for (let i = 0; i < gone.length; i += DELETE_BATCH) {
      await this.ctx.storage.delete(gone.slice(i, i + DELETE_BATCH).map((k) => `q:${k}`));
    }
  }
}
