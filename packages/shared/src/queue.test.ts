import { describe, expect, test } from "vitest";
import { QueueMessage } from "./queue";

describe("QueueMessage", () => {
  test.each([
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
  ])("accepts $type messages", (message) => {
    expect(QueueMessage.parse(message)).toEqual(message);
  });

  test("accepts correlated process messages", () => {
    const message = {
      type: "process_dat" as const,
      modId: "mod-1",
      packId: "pack-1",
    };
    expect(QueueMessage.parse(message)).toEqual(message);

    const correlatedMessage = {
      ...message,
      correlationId: "018f47a8-7a39-7be0-8000-000000000001",
    };
    expect(QueueMessage.parse(correlatedMessage)).toEqual(correlatedMessage);
  });

  test("rejects malformed correlation IDs", () => {
    expect(
      QueueMessage.safeParse({
        type: "process_dat",
        modId: "mod-1",
        packId: "pack-1",
        correlationId: "not-a-uuid",
      }).success
    ).toBe(false);
  });

  test("rejects stale and incomplete producer payloads", () => {
    expect(
      QueueMessage.safeParse({
        type: "process_dat",
        skinId: "legacy-skin-id",
        retiredField: "raw/mod-1.dat",
      }).success
    ).toBe(false);
    expect(
      QueueMessage.safeParse({
        type: "optimize_images",
        packId: "pack-1",
        imageKeys: [],
      }).success
    ).toBe(false);
  });
});
