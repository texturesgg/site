import { zValidator } from "@hono/zod-validator";
import { comments, createDb, reports } from "@vgskins/db";
import { logger } from "@vgskins/logger";
import { generateId, LIMITS, REPORT_REASONS, REPORT_TARGET_TYPES } from "@vgskins/shared";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { requireAuth } from "../lib/auth";
import { reportEmbed, sendDiscordWebhook } from "../lib/discord";
import { getModEmails, reportNotificationHtml, sendNotification } from "../lib/email";
import { loadPack } from "../lib/queries";
import { rateLimitByUser } from "../lib/rate-limit";
import { validationHook } from "../lib/validation";
import type { HonoEnv } from "../types";

const app = new Hono<HonoEnv>()
  // Submit a report (rate limited with the shared 50/min write ceiling per user:
  // each report emails every moderator and posts to Discord)
  .post(
    "/",
    requireAuth,
    rateLimitByUser((env) => env.RATE_LIMIT_UPLOAD),
    zValidator(
      "json",
      z.object({
        targetType: z.enum(REPORT_TARGET_TYPES),
        targetId: z.string().min(1),
        reason: z.enum(REPORT_REASONS),
        details: z
          .string()
          .max(
            LIMITS.REPORT_DETAILS_MAX,
            `Details must be ${LIMITS.REPORT_DETAILS_MAX} characters or fewer`
          )
          .optional(),
      }),
      validationHook
    ),
    async (c) => {
      const user = c.get("user");
      const { targetType, targetId, reason, details } = c.req.valid("json");
      const db = createDb(c.env.DB);

      // The target must be one the reporter can see, so a report never
      // confirms that a hidden pack, or a comment on one, exists.
      if (targetType === "pack") {
        const pack = await loadPack(db, { id: targetId }, { requester: user });
        if (!pack) return c.json({ error: "Pack not found" }, 404);
      } else if (targetType === "comment") {
        const comment = await db.query.comments.findFirst({
          where: eq(comments.id, targetId),
          columns: { packId: true },
        });
        const pack = comment && (await loadPack(db, { id: comment.packId }, { requester: user }));
        if (!pack) return c.json({ error: "Comment not found" }, 404);
      }

      // Check for duplicate pending report from same user on same target
      const existing = await db.query.reports.findFirst({
        where: and(
          eq(reports.reporterId, user.id),
          eq(reports.targetType, targetType),
          eq(reports.targetId, targetId),
          eq(reports.status, "pending")
        ),
      });

      if (existing) {
        return c.json({ error: "You already have a pending report for this item" }, 400);
      }

      const id = generateId();
      await db.insert(reports).values({
        id,
        reporterId: user.id,
        targetType,
        targetId,
        reason,
        details: details || null,
        status: "pending",
        createdAt: new Date(),
      });

      logger.info(
        { reportId: id, userId: user.id, targetType, targetId, reason },
        "Report submitted"
      );

      // Notify mods about the new report (fire-and-forget)
      c.executionCtx.waitUntil(
        getModEmails(db).then((emails) => {
          if (emails.length > 0) {
            return sendNotification(c.env.EMAIL, {
              to: emails,
              subject: `New ${targetType} report: ${reason}`,
              html: reportNotificationHtml({
                targetType,
                reason,
                details,
                reporterName: user.name,
              }),
            });
          }
        })
      );

      // Discord webhook — reports channel
      c.executionCtx.waitUntil(
        sendDiscordWebhook(
          c.env.DISCORD_WEBHOOK_REPORTS,
          reportEmbed({ reportId: id, targetType, reason, details, reporterName: user.name })
        )
      );

      return c.json({ success: true, id }, 200);
    }
  );

export default app;
