import { describe, expect, test } from "vitest";
import { correlateProcessingQueueMessages } from "./processing-queue-message";

const CORRELATION_ID = "018f47a8-7a39-7be0-8000-000000000001";

describe("processing queue correlation", () => {
  test("generates a valid correlation ID", () => {
    const [message] = correlateProcessingQueueMessages([
      {
        type: "process_dat",
        modId: "mod-1",
        packId: "pack-1",
      },
    ]);

    expect(message?.correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });

  test("adds one validated correlation ID to every message in a batch", () => {
    const messages = correlateProcessingQueueMessages(
      [
        {
          type: "process_dat",
          modId: "mod-1",
          packId: "pack-1",
        },
        {
          type: "optimize_images",
          packId: "pack-1",
          imageKeys: ["raw/pack-1.png"],
        },
      ],
      CORRELATION_ID
    );

    expect(messages).toHaveLength(2);
    expect(messages.every((message) => message.correlationId === CORRELATION_ID)).toBe(true);
  });

  test("rejects batches above Cloudflare's 100-message limit", () => {
    const messages = Array.from({ length: 101 }, (_, index) => ({
      type: "process_dat" as const,
      modId: `mod-${index}`,
      packId: "pack-1",
    }));

    expect(() => correlateProcessingQueueMessages(messages, CORRELATION_ID)).toThrow(RangeError);
  });

  test("rejects an invalid caller-supplied correlation ID", () => {
    expect(() =>
      correlateProcessingQueueMessages(
        [
          {
            type: "process_dat",
            modId: "mod-1",
            packId: "pack-1",
          },
        ],
        "not-a-uuid"
      )
    ).toThrow();
  });
});
