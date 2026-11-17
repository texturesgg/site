import { z } from "zod";

/**
 * The meeting point's contracts that other packages and apps use: its queue
 * list (GET meet.textures.gg/v1/queues) and the API's queue names
 * (MeetEntrypoint.queueLabel). packages/meet/src/protocol.ts has the game's.
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

/** A queue with someone searching in it. */
export const MeetQueueSummary = z.object({
  mode: MeetMode,
  label: MeetQueueLabel,
  searching: z.number().int().min(0),
});
export type MeetQueueSummary = z.infer<typeof MeetQueueSummary>;

/** The busiest queues first. */
export const MeetQueuesResponse = z.object({
  queues: z.array(MeetQueueSummary).max(MEET_QUEUES_MAX),
});
export type MeetQueuesResponse = z.infer<typeof MeetQueuesResponse>;
