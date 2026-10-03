import { tracing } from "cloudflare:workers";
import { logger } from "@vgskins/logger";
import {
  QUEUE_CORRELATION_ATTRIBUTE,
  type QueueMessage as QueueMessageType,
} from "@vgskins/shared/queue";
import {
  correlateProcessingQueueMessages,
  type ProcessingQueueMessageInput,
} from "./processing-queue-message";

function setPublishSpanAttributes(
  span: Span,
  correlationId: string,
  messages: QueueMessageType[]
): void {
  span.setAttribute(QUEUE_CORRELATION_ATTRIBUTE, correlationId);
  span.setAttribute("messaging.system", "cloudflare_queues");
  span.setAttribute("messaging.operation.type", "send");
  span.setAttribute("messaging.batch.message_count", messages.length);
  span.setAttribute(
    "vgskins.queue.message_types",
    [...new Set(messages.map((message) => message.type))].join(",")
  );
}

export async function sendProcessingQueueMessage(
  queue: Queue<QueueMessageType>,
  message: ProcessingQueueMessageInput
): Promise<void> {
  const [body] = correlateProcessingQueueMessages([message]);
  const correlationId = body?.correlationId;
  if (!body || !correlationId) throw new Error("Queue message correlation ID was not generated");

  await tracing.enterSpan("processing_queue.publish", async (span) => {
    setPublishSpanAttributes(span, correlationId, [body]);
    await queue.send(body);
    logger.info(
      { correlationId, messageCount: 1, messageTypes: body.type },
      "Processing queue message published"
    );
  });
}

export async function sendProcessingQueueBatch(
  queue: Queue<QueueMessageType>,
  messages: ProcessingQueueMessageInput[]
): Promise<void> {
  if (messages.length === 0) return;

  const bodies = correlateProcessingQueueMessages(messages);
  const correlationId = bodies[0]?.correlationId;
  if (!correlationId) throw new Error("Queue batch correlation ID was not generated");

  await tracing.enterSpan("processing_queue.publish_batch", async (span) => {
    setPublishSpanAttributes(span, correlationId, bodies);
    await queue.sendBatch(bodies.map((body) => ({ body })));
    logger.info(
      {
        correlationId,
        messageCount: bodies.length,
        messageTypes: [...new Set(bodies.map((body) => body.type))],
      },
      "Processing queue batch published"
    );
  });
}
