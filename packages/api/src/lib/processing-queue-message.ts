import { QueueMessage, type QueueMessage as QueueMessageType } from "@vgskins/shared/queue";

type WithoutCorrelation<T> = T extends { type: string } ? Omit<T, "correlationId"> : never;
export type ProcessingQueueMessageInput = WithoutCorrelation<QueueMessageType>;

const MAX_QUEUE_BATCH_MESSAGES = 100;

export function correlateProcessingQueueMessages(
  messages: ProcessingQueueMessageInput[],
  correlationId: string = crypto.randomUUID()
): QueueMessageType[] {
  if (messages.length > MAX_QUEUE_BATCH_MESSAGES) {
    throw new RangeError(`Queue batches cannot exceed ${MAX_QUEUE_BATCH_MESSAGES} messages`);
  }
  return messages.map((message) => QueueMessage.parse({ ...message, correlationId }));
}
