import { describe, expect, it, vi } from "vitest";
import { type DeadLetterBatch, handleDeadLetterBatch } from "./dead-letter";

const VALID_BODY = {
  type: "process_dat",
  modId: "mod-1",
  packId: "pack-1",
  correlationId: "11111111-1111-4111-8111-111111111111",
};

function createBatch(entries: { id: string; attempts: number; body: unknown }[]): {
  batch: DeadLetterBatch;
  acks: ReturnType<typeof vi.fn>[];
} {
  const acks = entries.map(() => vi.fn());
  const batch: DeadLetterBatch = {
    queue: "vgskins-processing-dlq",
    messages: entries.map((entry, index) => ({
      id: entry.id,
      attempts: entry.attempts,
      body: entry.body,
      ack: acks[index],
    })),
  };
  return { batch, acks };
}

describe("handleDeadLetterBatch", () => {
  it("acknowledges every dead letter so the queue does not redeliver it", async () => {
    const { batch, acks } = createBatch([
      { id: "msg-1", attempts: 6, body: VALID_BODY },
      { id: "msg-2", attempts: 6, body: { type: "unknown" } },
    ]);

    await handleDeadLetterBatch(batch, undefined);

    for (const ack of acks) {
      expect(ack).toHaveBeenCalledTimes(1);
    }
  });

  it("posts an alert naming each failed message when a webhook is configured", async () => {
    const { batch } = createBatch([
      { id: "msg-1", attempts: 6, body: VALID_BODY },
      { id: "msg-2", attempts: 6, body: { type: "unknown" } },
    ]);
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));

    await handleDeadLetterBatch(batch, "https://discord.example/webhook", fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://discord.example/webhook");
    const payload = JSON.parse(String(init?.body));
    expect(payload.embeds[0].description).toContain("vgskins-processing-dlq");
    expect(payload.embeds[0].fields).toHaveLength(2);
    expect(payload.embeds[0].fields[0].name).toContain("process_dat");
    expect(payload.embeds[0].fields[1].name).toContain("unparsed");
  });

  it("does not call the webhook when no alert destination is configured", async () => {
    const { batch, acks } = createBatch([{ id: "msg-1", attempts: 6, body: VALID_BODY }]);
    const fetchImpl = vi.fn<typeof fetch>();

    await handleDeadLetterBatch(batch, undefined, fetchImpl);

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(acks[0]).toHaveBeenCalledTimes(1);
  });

  it("still acknowledges when the alert webhook fails", async () => {
    const { batch, acks } = createBatch([{ id: "msg-1", attempts: 6, body: VALID_BODY }]);
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new Error("network down");
    });

    await expect(
      handleDeadLetterBatch(batch, "https://discord.example/webhook", fetchImpl)
    ).resolves.toBeUndefined();
    expect(acks[0]).toHaveBeenCalledTimes(1);
  });
});
