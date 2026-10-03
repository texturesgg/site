import { z } from "zod";

const QueueCorrelation = {
  // Optional during rollout so messages produced before this field existed remain processable.
  correlationId: z.string().uuid().optional(),
};

export const QUEUE_CORRELATION_ATTRIBUTE = "vgskins.queue.correlation_id";

export const ProcessDatFileMessage = z.object({
  ...QueueCorrelation,
  type: z.literal("process_dat"),
  modId: z.string().min(1),
  packId: z.string().min(1),
});
export type ProcessDatFileMessage = z.infer<typeof ProcessDatFileMessage>;

export const OptimizeImagesMessage = z.object({
  ...QueueCorrelation,
  type: z.literal("optimize_images"),
  packId: z.string().min(1),
  imageKeys: z.array(z.string().min(1)).min(1),
});
export type OptimizeImagesMessage = z.infer<typeof OptimizeImagesMessage>;

export const QueueMessage = z.discriminatedUnion("type", [
  ProcessDatFileMessage,
  OptimizeImagesMessage,
]);
export type QueueMessage = z.infer<typeof QueueMessage>;
