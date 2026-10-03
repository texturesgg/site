import { logger } from "@vgskins/logger";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ANALYTICS_EVENT_VERSION, type AnalyticsEvent, writeAnalyticsEvent } from "./analytics";

function recordingDataset() {
  const points: (AnalyticsEngineDataPoint | undefined)[] = [];
  const dataset: AnalyticsEngineDataset = { writeDataPoint: (point) => void points.push(point) };
  return { dataset, points };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("writeAnalyticsEvent", () => {
  it.each<{ event: AnalyticsEvent; blobs: string[] }>([
    {
      event: { version: ANALYTICS_EVENT_VERSION, type: "pack_view", packId: "pack-1" },
      blobs: ["pack-1", "pack_view", "", "1"],
    },
    {
      event: { version: ANALYTICS_EVENT_VERSION, type: "vote", packId: "pack-2" },
      blobs: ["pack-2", "vote", "", "1"],
    },
    {
      event: {
        version: ANALYTICS_EVENT_VERSION,
        type: "download",
        packId: "pack-3",
        downloadId: "download-1",
      },
      blobs: ["pack-3", "download", "download-1", "1"],
    },
  ])("writes a $event.type event in the stable column layout", ({ event, blobs }) => {
    const { dataset, points } = recordingDataset();
    writeAnalyticsEvent(dataset, event);
    expect(points).toEqual([{ blobs, doubles: [1], indexes: [event.packId] }]);
  });

  it("accepts a pack ID of exactly the 96-byte index limit", () => {
    const { dataset, points } = recordingDataset();
    writeAnalyticsEvent(dataset, { version: 1, type: "pack_view", packId: "é".repeat(48) });
    expect(points).toHaveLength(1);
  });

  // Callers are typed, so each of these reaches the helper only through a
  // contract change or untyped data; the cases stand in for both.
  it.each<[string, object]>([
    ["an unknown event type", { version: 1, type: "unknown", packId: "pack-1" }],
    ["another contract version", { version: 2, type: "vote", packId: "pack-1" }],
    ["a field outside the contract", { version: 1, type: "vote", packId: "pack-1", userId: "u" }],
    ["a download without its row ID", { version: 1, type: "download", packId: "pack-1" }],
    ["a pack ID over the index limit", { version: 1, type: "pack_view", packId: "é".repeat(49) }],
  ])("logs and drops %s", (_name, event) => {
    const logged = vi.spyOn(logger, "error").mockImplementation(() => {});
    const { dataset, points } = recordingDataset();
    writeAnalyticsEvent(dataset, event as AnalyticsEvent);
    expect(points).toEqual([]);
    expect(logged).toHaveBeenCalledWith(
      { issues: expect.any(Array) },
      "Rejected invalid analytics event"
    );
  });

  it("logs a failed write instead of throwing", () => {
    const logged = vi.spyOn(logger, "error").mockImplementation(() => {});
    const failure = new Error("binding unavailable");
    const dataset: AnalyticsEngineDataset = {
      writeDataPoint: () => {
        throw failure;
      },
    };
    expect(() =>
      writeAnalyticsEvent(dataset, { version: 1, type: "vote", packId: "pack-1" })
    ).not.toThrow();
    expect(logged).toHaveBeenCalledWith(
      { err: failure, eventType: "vote", eventVersion: 1, packId: "pack-1" },
      "Failed to write analytics event"
    );
  });
});
