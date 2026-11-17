import { z } from "zod";

/**
 * The meeting point's contracts that other packages and apps use: its queue
 * list (GET meet.textures.gg/v1/queues) and the API's queue names
 * (MeetEntrypoint.queueInfo, standingQueues). packages/meet/src/protocol.ts has the game's.
 */

/** A queue's mode: "vs" (VS Mode, 1 on 1) or a mod's menu entry ("main/first-to-3"). */
export const MEET_MODE_MAX = 64;
export const MeetMode = z
  .string()
  .max(MEET_MODE_MAX)
  .regex(/^[a-z0-9][a-z0-9/_.-]*$/);
export type MeetMode = z.infer<typeof MeetMode>;

/** The longest list of mods a game sends ("id version, ...", tgg_mod_set_names). */
export const MEET_MAX_NAMES = 2000;
export const MeetModNames = z.string().max(MEET_MAX_NAMES);

/** The longest queue name. */
export const MEET_MAX_LABEL = 48;
export const MeetQueueLabel = z.string().min(1).max(MEET_MAX_LABEL);

/** A registry set's name, as a standing queue names its set. */
export const MeetQueueSet = z.string().min(1).max(64);

/** A mod a queue needs, at the version its players run. */
export const MeetQueueMod = z.object({
  id: z.string().min(1).max(64),
  version: z.string().min(1).max(64),
});
export type MeetQueueMod = z.infer<typeof MeetQueueMod>;

/** The most mods a queue lists. */
export const MEET_QUEUE_MODS_MAX = 64;
export const MeetQueueMods = z.array(MeetQueueMod).max(MEET_QUEUE_MODS_MAX);

/** The queue's name, set and mods asked of the API: from the mods counted in the queue. */
export const MeetQueueInfoRequest = z.object({ names: MeetModNames });
export type MeetQueueInfoRequest = z.infer<typeof MeetQueueInfoRequest>;

/**
 * The API's answer: the name, the standing queue's set when the mods are
 * exactly that set's gameplay mods, and the mods; null when the registry
 * can't say.
 */
export const MeetQueueInfo = z
  .object({ label: MeetQueueLabel, set: MeetQueueSet.nullable(), mods: MeetQueueMods })
  .nullable();
export type MeetQueueInfo = z.infer<typeof MeetQueueInfo>;

/** A standing queue as the API lists it: a set marked as a queue and its gameplay mods. */
export const MeetStandingQueue = z.object({
  set: MeetQueueSet,
  label: MeetQueueLabel,
  mods: MeetQueueMods,
});
export type MeetStandingQueue = z.infer<typeof MeetStandingQueue>;
export const MEET_STANDING_MAX = 10;
export const MeetStandingQueues = z.array(MeetStandingQueue).max(MEET_STANDING_MAX);

/** The queue name asked of the API: from the mods counted in the queue. */
export const MeetQueueLabelRequest = z.object({ names: MeetModNames });
export type MeetQueueLabelRequest = z.infer<typeof MeetQueueLabelRequest>;

/** The API's answer: the name, or null when the registry can't name it. */
export const MeetQueueLabelResult = MeetQueueLabel.nullable();
export type MeetQueueLabelResult = z.infer<typeof MeetQueueLabelResult>;

/** GET /v1/queues lists at most this many, MEET_QUEUES_DEFAULT unless asked. */
export const MEET_QUEUES_MAX = 50;
export const MEET_QUEUES_DEFAULT = 20;
export const MeetQueuesQuery = z.object({
  limit: z.coerce.number().int().min(1).max(MEET_QUEUES_MAX).default(MEET_QUEUES_DEFAULT),
});
export type MeetQueuesQuery = z.infer<typeof MeetQueuesQuery>;

/**
 * "standing": a registry set marked as a queue (Competitive), listed even
 * when nobody is searching. "player": one that exists because someone is
 * searching with their own gameplay mods.
 */
export const MeetQueueKind = z.enum(["standing", "player"]);
export type MeetQueueKind = z.infer<typeof MeetQueueKind>;

/** A mode as a player reads it: "vs" is VS Mode, a mod's "main/first-to-3" is "First to 3". */
export function meetModeLabel(mode: string): string {
  if (mode === "vs") return "VS Mode";
  const words = (mode.split("/").at(-1) ?? mode).replace(/[-_.]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : mode;
}

/** A queue's name and count, as the game hears it while searching. */
export const MeetQueueSummary = z.object({
  mode: MeetMode,
  label: MeetQueueLabel,
  searching: z.number().int().min(0),
});
export type MeetQueueSummary = z.infer<typeof MeetQueueSummary>;

/**
 * A queue in the list. Readers from before `kind`, `mode_label`, `mods` and
 * `set` see them as their defaults.
 */
export const MeetQueueEntry = MeetQueueSummary.extend({
  kind: MeetQueueKind.default("player"),
  /** The mode as a player reads it ("VS Mode", "First to 3"). */
  mode_label: z.string().min(1).max(MEET_MODE_MAX).optional(),
  /** The gameplay mods the queue needs, what "Join" installs before searching. */
  mods: MeetQueueMods.default([]),
  /** The registry set a standing queue comes from. */
  set: MeetQueueSet.optional(),
});
export type MeetQueueEntry = z.infer<typeof MeetQueueEntry>;

/** Standing queues first, in the registry's order, then the busiest player queues. */
export const MeetQueuesResponse = z.object({
  queues: z.array(MeetQueueEntry).max(MEET_QUEUES_MAX),
});
export type MeetQueuesResponse = z.infer<typeof MeetQueuesResponse>;
