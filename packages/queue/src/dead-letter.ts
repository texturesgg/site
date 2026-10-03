import { logger } from "@vgskins/logger";
import { QueueMessage } from "@vgskins/shared/queue";

// Messages that exhaust their retries are routed to a dead-letter queue. Nothing
// consumed that queue, so a permanent processing failure was never surfaced to
// anyone. This handler reports every dead letter (a structured error log plus an
// optional webhook alert) and then acknowledges it, so the message becomes
// visible instead of silently expiring.

const DEAD_LETTER_ALERT_COLOR = 0xdc2626;
const MAX_ALERT_FIELDS = 10;

export interface DeadLetterMessage {
  readonly id: string;
  readonly attempts: number;
  readonly body: unknown;
  ack(): void;
}

export interface DeadLetterBatch {
  readonly queue: string;
  readonly messages: readonly DeadLetterMessage[];
}

interface DeadLetterReport {
  messageId: string;
  attempts: number;
  type: string;
  correlationId?: string;
  body: unknown;
}

function toReport(message: DeadLetterMessage): DeadLetterReport {
  const parsed = QueueMessage.safeParse(message.body);
  if (parsed.success) {
    return {
      messageId: message.id,
      attempts: message.attempts,
      type: parsed.data.type,
      correlationId: parsed.data.correlationId,
      body: parsed.data,
    };
  }
  return {
    messageId: message.id,
    attempts: message.attempts,
    type: "unparsed",
    body: message.body,
  };
}

export async function handleDeadLetterBatch(
  batch: DeadLetterBatch,
  webhookUrl: string | undefined,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  const reports = batch.messages.map(toReport);

  logger.error(
    { queue: batch.queue, deadLetterCount: reports.length, deadLetters: reports },
    "Queue messages were dead-lettered after exhausting retries"
  );

  if (webhookUrl) {
    await sendDeadLetterAlert(webhookUrl, batch.queue, reports, fetchImpl);
  } else {
    logger.warn(
      { queue: batch.queue, deadLetterCount: reports.length },
      "DISCORD_WEBHOOK_ALERTS is unset; dead letters were logged only"
    );
  }

  for (const message of batch.messages) {
    message.ack();
  }
}

async function sendDeadLetterAlert(
  webhookUrl: string,
  queue: string,
  reports: DeadLetterReport[],
  fetchImpl: typeof fetch
): Promise<void> {
  const fields = reports.slice(0, MAX_ALERT_FIELDS).map((report) => ({
    name: `${report.type} (${report.messageId})`,
    value: `Attempts: ${report.attempts}${
      report.correlationId ? `\nCorrelation: ${report.correlationId}` : ""
    }`,
  }));

  try {
    const res = await fetchImpl(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [
          {
            title: "Queue dead letters",
            description: `${reports.length} message(s) exhausted retries on ${queue}`,
            color: DEAD_LETTER_ALERT_COLOR,
            fields,
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    });

    if (!res.ok) {
      logger.error(
        { status: res.status, body: await res.text() },
        "Dead-letter alert webhook failed"
      );
    }
  } catch (error) {
    logger.error({ error }, "Dead-letter alert webhook request error");
  }
}
