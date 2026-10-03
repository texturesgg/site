import { logger } from "@vgskins/logger";
import { z } from "zod";

export const ANALYTICS_EVENT_VERSION = 1 as const;

const analyticsIdentifierSchema = z
  .string()
  .min(1)
  .refine((value) => new TextEncoder().encode(value).byteLength <= 96, {
    message: "Analytics identifiers must not exceed 96 bytes",
  });

const analyticsEventBaseSchema = z.strictObject({
  version: z.literal(ANALYTICS_EVENT_VERSION),
  packId: analyticsIdentifierSchema,
});

const analyticsEventSchema = z.discriminatedUnion("type", [
  analyticsEventBaseSchema.extend({ type: z.literal("pack_view") }),
  analyticsEventBaseSchema.extend({ type: z.literal("vote") }),
  analyticsEventBaseSchema.extend({
    type: z.literal("download"),
    downloadId: analyticsIdentifierSchema,
  }),
]);

export type AnalyticsEvent = z.infer<typeof analyticsEventSchema>;

function toAnalyticsDataPoint(event: AnalyticsEvent): AnalyticsEngineDataPoint {
  // Analytics Engine columns are ordered. Preserve existing positions when this contract evolves.
  return {
    blobs: [
      event.packId,
      event.type,
      event.type === "download" ? event.downloadId : "",
      String(event.version),
    ],
    doubles: [1],
    indexes: [event.packId],
  };
}

export function writeAnalyticsEvent(
  analytics: AnalyticsEngineDataset,
  event: AnalyticsEvent
): void {
  const parsed = analyticsEventSchema.safeParse(event);
  if (!parsed.success) {
    logger.error({ issues: parsed.error.issues }, "Rejected invalid analytics event");
    return;
  }

  try {
    analytics.writeDataPoint(toAnalyticsDataPoint(parsed.data));
  } catch (error) {
    logger.error(
      {
        err: error,
        eventType: parsed.data.type,
        eventVersion: parsed.data.version,
        packId: parsed.data.packId,
      },
      "Failed to write analytics event"
    );
  }
}
