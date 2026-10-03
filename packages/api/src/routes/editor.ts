import { zValidator } from "@hono/zod-validator";
import { logger } from "@vgskins/logger";
import { generateId } from "@vgskins/shared";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { editorReportEmbed, sendDiscordWebhook } from "../lib/discord";
import { rateLimitByIp } from "../lib/rate-limit";
import { validationHook } from "../lib/validation";
import type { HonoEnv } from "../types";

/** The desktop editor caps what it sends well below this. */
export const MAX_EDITOR_REPORT_CHARS = 128 * 1024;

/** Where a problem report is kept. The id is the only way to find it. */
function editorReportKey(id: string, received: Date): string {
  return `editor-reports/${received.toISOString().slice(0, 10)}/${id}.txt`;
}

const app = new Hono<HonoEnv>()
  // A problem report the player chose to send from the desktop app: its
  // log, app version, and OS. No account, so the route is bounded by size
  // and a strict per-IP limit instead.
  .post(
    "/reports",
    rateLimitByIp((env) => env.RATE_LIMIT_EDITOR_REPORT),
    bodyLimit({
      // JSON escaping and multi-byte characters can each double the text.
      maxSize: MAX_EDITOR_REPORT_CHARS * 4,
      onError: (c) => c.json({ error: "Report is too large" }, 413),
    }),
    zValidator(
      "json",
      z.object({
        report: z
          .string()
          .trim()
          .min(1, "Report is empty")
          .max(MAX_EDITOR_REPORT_CHARS, "Report is too large"),
      }),
      validationHook
    ),
    async (c) => {
      const { report } = c.req.valid("json");
      const id = generateId();
      await c.env.BUCKET.put(editorReportKey(id, new Date()), report, {
        httpMetadata: { contentType: "text/plain; charset=utf-8" },
      });
      logger.info({ reportId: id, chars: report.length }, "Editor report received");

      c.executionCtx.waitUntil(
        sendDiscordWebhook(
          c.env.DISCORD_WEBHOOK_REPORTS,
          editorReportEmbed({ reportId: id, chars: report.length })
        )
      );
      return c.json({ id }, 201);
    }
  );

export default app;
