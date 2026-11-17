import { type MeetQueueEntry, type MeetStandingQueue, meetModeLabel } from "@vgskins/shared/meet";
import type { QueueListing } from "./directory";

/** The mode a standing queue plays: a set's mods in VS Mode. */
export const STANDING_MODE = "vs";

/**
 * GET /v1/queues: the standing queues first, in the registry's order and
 * listed even with nobody searching, then the busiest other queues. A queue
 * whose players run exactly a standing set in VS Mode counts toward that
 * set's row instead of getting its own.
 */
export function listQueues(
  standing: readonly MeetStandingQueue[],
  rows: readonly QueueListing[],
  limit: number
): MeetQueueEntry[] {
  const standingSets = new Set(standing.map((queue) => queue.set));
  const folds = (row: QueueListing) =>
    row.set !== null && row.mode === STANDING_MODE && standingSets.has(row.set);

  const standingRows: MeetQueueEntry[] = standing.map((queue) => ({
    kind: "standing",
    mode: STANDING_MODE,
    mode_label: meetModeLabel(STANDING_MODE),
    label: queue.label,
    searching: rows
      .filter((row) => folds(row) && row.set === queue.set)
      .reduce((sum, row) => sum + row.searching, 0),
    mods: queue.mods,
    set: queue.set,
  }));
  const playerRows: MeetQueueEntry[] = rows
    .filter((row) => row.searching > 0 && !folds(row))
    .map((row) => ({
      kind: "player",
      mode: row.mode,
      mode_label: meetModeLabel(row.mode),
      label: row.label,
      searching: row.searching,
      mods: row.mods,
    }));
  return [...standingRows, ...playerRows].slice(0, limit);
}
