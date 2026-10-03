import { zValidator } from "@hono/zod-validator";
import {
  accounts,
  comments,
  createDb,
  deletePackObjects,
  downloads,
  games,
  packs,
  reports,
  sessions,
  targets,
  transitionPack,
  users,
  votes,
} from "@vgskins/db";
import { logger } from "@vgskins/logger";
import { REPORT_STATUSES, USER_ROLES } from "@vgskins/shared";
import { and, asc, count, desc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { isModerator, requireAdmin, requireAuth, requireModerator } from "../lib/auth";
import { packApprovedEmbed, sendDiscordWebhook, thumbnailUrl } from "../lib/discord";
import { moderationResultHtml, sendNotification } from "../lib/email";
import { deleteComment, dismissReportsOnDeletedTargets } from "../lib/moderation";
import {
  likeContains,
  PaginationQuery,
  paginationResponse,
  parsePagination,
  sanitizeSearch,
  validationHook,
} from "../lib/validation";
import type { HonoEnv } from "../types";

/** Delete a pack's stored objects, logging instead of failing the request. */
async function removePackObjects(bucket: R2Bucket, packId: string): Promise<number> {
  try {
    return await deletePackObjects(bucket, packId);
  } catch (error) {
    logger.warn({ packId, error }, "Failed to delete a pack's stored objects");
    return 0;
  }
}

const analyticsQuerySchema = z.object({
  days: z.enum(["7", "30", "90"]).default("30"),
});

const app = new Hono<HonoEnv>()
  // Admin dashboard counts
  .get("/stats", requireAuth, requireModerator, async (c) => {
    const db = createDb(c.env.DB);

    const [[{ pendingPacks }], [{ pendingReports }], [{ totalUsers }]] = await Promise.all([
      db
        .select({ pendingPacks: count() })
        .from(packs)
        .where(and(eq(packs.status, "pending"), isNull(packs.deletedAt))),
      db.select({ pendingReports: count() }).from(reports).where(eq(reports.status, "pending")),
      db.select({ totalUsers: count() }).from(users),
    ]);

    return c.json({ pendingPacks, pendingReports, totalUsers }, 200);
  })
  // Admin analytics dashboard
  .get(
    "/analytics",
    requireAuth,
    requireAdmin,
    zValidator("query", analyticsQuerySchema, validationHook),
    async (c) => {
      const db = createDb(c.env.DB);
      const days = Number(c.req.valid("query").days);
      const startAt = new Date();
      startAt.setUTCHours(0, 0, 0, 0);
      startAt.setUTCDate(startAt.getUTCDate() - days + 1);

      const downloadDay = sql<string>`date(${downloads.downloadedAt} / 1000, 'unixepoch')`;
      const signupDay = sql<string>`date(${users.createdAt} / 1000, 'unixepoch')`;
      const packDay = sql<string>`date(${packs.createdAt} / 1000, 'unixepoch')`;
      const periodDownloadCount = count(downloads.id);

      const [
        [{ trackedDownloads }],
        [{ allTimeDownloads }],
        [{ totalUsers, newUsers }],
        [{ newPacks }],
        [{ totalComments }],
        [{ totalVotes }],
        packStatuses,
        topPacks,
        downloadActivity,
        signupActivity,
        packActivity,
      ] = await Promise.all([
        db
          .select({ trackedDownloads: count() })
          .from(downloads)
          .where(gte(downloads.downloadedAt, startAt)),
        db
          .select({
            allTimeDownloads: sql<number>`coalesce(sum(${packs.downloadCount}), 0)`.mapWith(Number),
          })
          .from(packs)
          .where(isNull(packs.deletedAt)),
        db
          .select({
            totalUsers: count(),
            newUsers:
              sql<number>`coalesce(sum(case when ${users.createdAt} >= ${startAt.getTime()} then 1 else 0 end), 0)`.mapWith(
                Number
              ),
          })
          .from(users),
        db
          .select({ newPacks: count() })
          .from(packs)
          .where(and(isNull(packs.deletedAt), gte(packs.createdAt, startAt))),
        db.select({ totalComments: count() }).from(comments),
        db.select({ totalVotes: count() }).from(votes),
        db
          .select({ status: packs.status, count: count() })
          .from(packs)
          .where(isNull(packs.deletedAt))
          .groupBy(packs.status)
          .orderBy(desc(count())),
        db
          .select({
            id: packs.id,
            title: packs.title,
            slug: packs.slug,
            gameSlug: games.slug,
            periodDownloads: periodDownloadCount,
            allTimeDownloads: packs.downloadCount,
          })
          .from(packs)
          .innerJoin(games, eq(packs.gameId, games.id))
          .leftJoin(
            downloads,
            and(eq(downloads.packId, packs.id), gte(downloads.downloadedAt, startAt))
          )
          .where(and(eq(packs.status, "approved"), isNull(packs.deletedAt)))
          .groupBy(packs.id)
          .orderBy(desc(periodDownloadCount), desc(packs.downloadCount))
          .limit(25),
        db
          .select({ day: downloadDay, count: count() })
          .from(downloads)
          .where(gte(downloads.downloadedAt, startAt))
          .groupBy(downloadDay)
          .orderBy(asc(downloadDay)),
        db
          .select({ day: signupDay, count: count() })
          .from(users)
          .where(gte(users.createdAt, startAt))
          .groupBy(signupDay)
          .orderBy(asc(signupDay)),
        db
          .select({ day: packDay, count: count() })
          .from(packs)
          .where(and(isNull(packs.deletedAt), gte(packs.createdAt, startAt)))
          .groupBy(packDay)
          .orderBy(asc(packDay)),
      ]);

      const downloadsByDay = new Map(downloadActivity.map((row) => [row.day, row.count]));
      const signupsByDay = new Map(signupActivity.map((row) => [row.day, row.count]));
      const packsByDay = new Map(packActivity.map((row) => [row.day, row.count]));
      const activity = Array.from({ length: days }, (_, offset) => {
        const date = new Date(startAt);
        date.setUTCDate(startAt.getUTCDate() + offset);
        const day = date.toISOString().slice(0, 10);

        return {
          day,
          downloads: downloadsByDay.get(day) ?? 0,
          signups: signupsByDay.get(day) ?? 0,
          packs: packsByDay.get(day) ?? 0,
        };
      });

      return c.json(
        {
          generatedAt: new Date().toISOString(),
          days,
          overview: {
            trackedDownloads,
            allTimeDownloads,
            totalUsers,
            newUsers,
            totalPacks: packStatuses.reduce((total, row) => total + row.count, 0),
            newPacks,
            totalComments,
            totalVotes,
          },
          packStatuses,
          activity,
          topPacks,
        },
        200
      );
    }
  )
  // List pending packs for moderation
  .get("/packs/pending", requireAuth, requireModerator, async (c) => {
    const user = c.get("user");

    const db = createDb(c.env.DB);

    logger.info({ userId: user.id }, "Fetching pending packs for moderation");

    const items = await db
      .select({
        id: packs.id,
        title: packs.title,
        slug: packs.slug,
        description: packs.description,
        thumbnailKey: packs.thumbnailKey,
        status: packs.status,
        createdAt: packs.createdAt,
        gameName: games.name,
        gameSlug: games.slug,
        targetName: targets.name,
        userName: users.name,
        modCount: sql<number>`(SELECT COUNT(*) FROM mods WHERE mods.pack_id = ${packs.id})`,
      })
      .from(packs)
      .leftJoin(games, eq(packs.gameId, games.id))
      .leftJoin(targets, eq(packs.targetId, targets.id))
      .leftJoin(users, eq(packs.userId, users.id))
      .where(and(eq(packs.status, "pending"), isNull(packs.deletedAt)))
      .orderBy(desc(packs.createdAt));

    return c.json({ items }, 200);
  })
  // Approve a pack
  .post("/packs/:id/approve", requireAuth, requireModerator, async (c) => {
    const user = c.get("user");

    const db = createDb(c.env.DB);
    const packId = c.req.param("id");

    logger.info({ userId: user.id, packId }, "Approving pack");

    const approved = await transitionPack(db, packId, {
      from: ["pending"],
      to: "approved",
      set: { publishedAt: new Date() },
    });
    const pack = await db.query.packs.findFirst({ where: eq(packs.id, packId) });
    if (!pack) {
      return c.json({ error: "Pack not found" }, 404);
    }
    if (!approved) {
      return c.json({ error: "Pack is not pending" }, 409);
    }

    logger.info({ packId }, "Pack approved");

    // Notify uploader (fire-and-forget)
    const packOwner = await db.query.users.findFirst({
      where: eq(users.id, pack.userId),
      columns: { email: true, name: true },
    });
    const game = await db.query.games.findFirst({
      where: eq(games.id, pack.gameId),
      columns: { slug: true },
    });
    const gameSlug = game?.slug ?? "melee";

    if (packOwner?.email) {
      c.executionCtx.waitUntil(
        sendNotification(c.env.EMAIL, {
          to: packOwner.email,
          subject: `Your pack "${pack.title}" has been approved!`,
          html: moderationResultHtml({
            title: pack.title,
            type: "pack",
            status: "approved",
            skinUrl: `https://textures.gg/games/${gameSlug}/packs/${pack.slug}`,
          }),
        })
      );
    }

    // Discord webhook — public uploads channel
    c.executionCtx.waitUntil(
      sendDiscordWebhook(
        c.env.DISCORD_WEBHOOK_UPLOADS,
        packApprovedEmbed({
          packTitle: pack.title,
          packSlug: pack.slug,
          gameSlug,
          creatorName: packOwner?.name ?? "Unknown",
          thumbnailUrl: thumbnailUrl(c.env.ASSETS_BASE_URL, pack.thumbnailKey),
        })
      )
    );

    return c.json({ success: true, status: "approved" }, 200);
  })
  // Reject a pack
  .post("/packs/:id/reject", requireAuth, requireModerator, async (c) => {
    const user = c.get("user");

    const db = createDb(c.env.DB);
    const packId = c.req.param("id");

    logger.info({ userId: user.id, packId }, "Rejecting pack");

    const rejected = await transitionPack(db, packId, { from: ["pending"], to: "rejected" });
    const pack = await db.query.packs.findFirst({ where: eq(packs.id, packId) });
    if (!pack) {
      return c.json({ error: "Pack not found" }, 404);
    }
    if (!rejected) {
      return c.json({ error: "Pack is not pending" }, 409);
    }

    logger.info({ packId }, "Pack rejected");
    c.executionCtx.waitUntil(removePackObjects(c.env.BUCKET, packId));

    // Notify uploader (fire-and-forget)
    const packOwner = await db.query.users.findFirst({
      where: eq(users.id, pack.userId),
      columns: { email: true },
    });
    if (packOwner?.email) {
      c.executionCtx.waitUntil(
        sendNotification(c.env.EMAIL, {
          to: packOwner.email,
          subject: `Update on your pack "${pack.title}"`,
          html: moderationResultHtml({
            title: pack.title,
            type: "pack",
            status: "rejected",
          }),
        })
      );
    }

    return c.json({ success: true, status: "rejected" }, 200);
  })
  // List users with their auth providers (moderator + admin)
  .get(
    "/users",
    requireAuth,
    requireModerator,
    zValidator(
      "query",
      PaginationQuery.extend({
        search: z.string().optional(),
        role: z.enum(USER_ROLES).optional(),
      }),
      validationHook
    ),
    async (c) => {
      const user = c.get("user");

      const db = createDb(c.env.DB);
      const query = c.req.valid("query");
      const pagination = parsePagination(query, { defaultPageSize: 50 });
      const search = sanitizeSearch(query.search);
      const roleFilter = query.role;

      logger.info({ userId: user.id, search, role: roleFilter }, "Fetching users with providers");

      const conditions = [];
      if (search) {
        conditions.push(or(likeContains(users.name, search), likeContains(users.email, search)));
      }
      if (roleFilter) {
        conditions.push(eq(users.role, roleFilter));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [{ total }] = await db.select({ total: count() }).from(users).where(whereClause);

      // Paginate users first, then join providers for just this page.
      // The previous LEFT JOIN paginated over joined rows, so multi-provider
      // users occupied multiple slots and could split across page boundaries.
      const paginatedUsers = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          emailVerified: users.emailVerified,
          image: users.image,
          role: users.role,
          banned: users.banned,
          banReason: users.banReason,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(whereClause)
        .orderBy(desc(users.createdAt))
        .limit(pagination.pageSize)
        .offset(pagination.offset);

      if (paginatedUsers.length === 0) {
        return c.json(paginationResponse([], total, pagination), 200);
      }

      const userIds = paginatedUsers.map((u) => u.id);
      const userAccounts = await db
        .select({
          userId: accounts.userId,
          providerId: accounts.providerId,
        })
        .from(accounts)
        .where(inArray(accounts.userId, userIds));

      const accountsMap = new Map<string, string[]>();
      for (const acc of userAccounts) {
        const existing = accountsMap.get(acc.userId);
        if (existing) {
          existing.push(acc.providerId);
        } else {
          accountsMap.set(acc.userId, [acc.providerId]);
        }
      }

      const enriched = paginatedUsers.map((u) => ({
        ...u,
        providers: accountsMap.get(u.id) ?? [],
      }));

      return c.json(paginationResponse(enriched, total, pagination), 200);
    }
  )
  // Manually verify a user's email (admin only)
  .post("/users/:id/verify-email", requireAuth, requireAdmin, async (c) => {
    const actor = c.get("user");

    const db = createDb(c.env.DB);
    const userId = c.req.param("id");

    const target = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!target) {
      return c.json({ error: "User not found" }, 404);
    }

    if (target.emailVerified) {
      return c.json({ success: true, message: "Already verified" }, 200);
    }

    await db
      .update(users)
      .set({ emailVerified: true, updatedAt: new Date() })
      .where(eq(users.id, userId));

    logger.info({ actorId: actor.id, userId }, "Manually verified user email");

    return c.json({ success: true }, 200);
  })
  // List reports (moderator + admin)
  .get(
    "/reports",
    requireAuth,
    requireModerator,
    zValidator(
      "query",
      PaginationQuery.extend({ status: z.enum(REPORT_STATUSES).optional() }),
      validationHook
    ),
    async (c) => {
      const db = createDb(c.env.DB);
      const query = c.req.valid("query");
      const pagination = parsePagination(query, { defaultPageSize: 50 });
      const statusFilter = query.status;

      const conditions = [];
      if (statusFilter) {
        conditions.push(eq(reports.status, statusFilter));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [{ total }] = await db.select({ total: count() }).from(reports).where(whereClause);

      const result = await db
        .select({
          id: reports.id,
          reporterId: reports.reporterId,
          reporterName: users.name,
          targetType: reports.targetType,
          targetId: reports.targetId,
          reason: reports.reason,
          details: reports.details,
          status: reports.status,
          resolvedBy: reports.resolvedBy,
          resolvedAt: reports.resolvedAt,
          createdAt: reports.createdAt,
        })
        .from(reports)
        .leftJoin(users, eq(reports.reporterId, users.id))
        .where(whereClause)
        .orderBy(desc(reports.createdAt))
        .limit(pagination.pageSize)
        .offset(pagination.offset);

      // Enrich with target context
      const packTargetIds = result.filter((r) => r.targetType === "pack").map((r) => r.targetId);
      const commentTargetIds = result
        .filter((r) => r.targetType === "comment")
        .map((r) => r.targetId);

      const packMap = new Map<string, { title: string; slug: string; gameSlug: string }>();
      const commentMap = new Map<
        string,
        { body: string; packSlug: string | null; gameSlug: string | null }
      >();

      if (packTargetIds.length > 0) {
        const packData = await db
          .select({ id: packs.id, title: packs.title, slug: packs.slug, gameSlug: games.slug })
          .from(packs)
          .leftJoin(games, eq(packs.gameId, games.id))
          .where(inArray(packs.id, packTargetIds));
        for (const p of packData) {
          packMap.set(p.id, { title: p.title, slug: p.slug, gameSlug: p.gameSlug ?? "" });
        }
      }

      if (commentTargetIds.length > 0) {
        const commentData = await db
          .select({
            id: comments.id,
            body: comments.body,
            packSlug: packs.slug,
            gameSlug: games.slug,
          })
          .from(comments)
          .leftJoin(packs, eq(comments.packId, packs.id))
          .leftJoin(games, eq(packs.gameId, games.id))
          .where(inArray(comments.id, commentTargetIds));
        for (const cm of commentData) {
          commentMap.set(cm.id, {
            body: cm.body,
            packSlug: cm.packSlug,
            gameSlug: cm.gameSlug,
          });
        }
      }

      const enriched = result.map((r) => {
        if (r.targetType === "pack") {
          const pack = packMap.get(r.targetId);
          return {
            ...r,
            targetLabel: pack?.title ?? "[deleted]",
            targetSlug: pack?.slug ?? null,
            targetGameSlug: pack?.gameSlug ?? null,
          };
        }
        const cm = commentMap.get(r.targetId);
        return {
          ...r,
          targetLabel: cm?.body
            ? cm.body.length > 80
              ? `${cm.body.slice(0, 80)}...`
              : cm.body
            : "[deleted]",
          targetSlug: cm?.packSlug ?? null,
          targetGameSlug: cm?.gameSlug ?? null,
        };
      });

      return c.json(paginationResponse(enriched, total, pagination), 200);
    }
  )
  // Resolve or dismiss a report (moderator + admin)
  .post(
    "/reports/:id/resolve",
    requireAuth,
    requireModerator,
    zValidator("json", z.object({ action: z.enum(["resolved", "dismissed"]) }), validationHook),
    async (c) => {
      const user = c.get("user");

      const db = createDb(c.env.DB);
      const reportId = c.req.param("id");
      const { action } = c.req.valid("json");

      const report = await db.query.reports.findFirst({
        where: eq(reports.id, reportId),
      });

      if (!report) {
        return c.json({ error: "Report not found" }, 404);
      }

      if (report.status !== "pending") {
        return c.json({ error: "Report already processed" }, 400);
      }

      await db
        .update(reports)
        .set({
          status: action,
          resolvedBy: user.id,
          resolvedAt: new Date(),
        })
        .where(eq(reports.id, reportId));

      logger.info({ reportId, action, actorId: user.id }, "Report processed");

      return c.json({ success: true, status: action }, 200);
    }
  )
  // Soft-delete a pack (moderator + admin, or owner)
  .post("/packs/:id/delete", requireAuth, async (c) => {
    const actor = c.get("user");

    const db = createDb(c.env.DB);
    const packId = c.req.param("id");

    const pack = await db.query.packs.findFirst({
      where: and(eq(packs.id, packId), isNull(packs.deletedAt)),
    });

    if (!pack) {
      return c.json({ error: "Pack not found" }, 404);
    }

    const isOwner = pack.userId === actor.id;
    if (!isOwner && !isModerator(actor)) {
      return c.json({ error: "Not authorized to delete this pack" }, 403);
    }

    const now = new Date();
    await db.update(packs).set({ deletedAt: now, updatedAt: now }).where(eq(packs.id, packId));
    c.executionCtx.waitUntil(removePackObjects(c.env.BUCKET, packId));

    logger.info({ actorId: actor.id, packId, title: pack.title }, "Pack soft-deleted");

    return c.json({ success: true }, 200);
  })
  // Delete a comment (moderator + admin)
  .post("/comments/:id/delete", requireAuth, requireModerator, async (c) => {
    const actor = c.get("user");

    const db = createDb(c.env.DB);
    const commentId = c.req.param("id");

    const comment = await db.query.comments.findFirst({
      where: eq(comments.id, commentId),
    });

    if (!comment) {
      return c.json({ error: "Comment not found" }, 404);
    }

    await deleteComment(db, commentId);

    logger.info({ actorId: actor.id, commentId }, "Comment deleted by moderator");

    return c.json({ success: true }, 200);
  })
  // Ban user and purge all their content (admin only)
  .post(
    "/users/:id/ban-purge",
    requireAuth,
    requireAdmin,
    zValidator("json", z.object({ banReason: z.string().optional() }), validationHook),
    async (c) => {
      const actor = c.get("user");

      const db = createDb(c.env.DB);
      const userId = c.req.param("id");
      const { banReason } = c.req.valid("json");

      if (userId === actor.id) {
        return c.json({ error: "Cannot ban yourself" }, 403);
      }

      const target = await db.query.users.findFirst({
        where: eq(users.id, userId),
      });

      if (!target) {
        return c.json({ error: "User not found" }, 404);
      }

      // 1. Ban the user and end their sessions first, so nothing new arrives
      // while their content is removed.
      await db
        .update(users)
        .set({
          banned: true,
          banReason: banReason || "Account purged by admin",
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
      await db.delete(sessions).where(eq(sessions.userId, userId));

      // 2. Find the user's packs
      const userPacks = await db
        .select({ id: packs.id })
        .from(packs)
        .where(eq(packs.userId, userId));
      const packIds = userPacks.map((p) => p.id);

      // 3. Delete the user's packs (cascading to their mods, votes, downloads,
      // tags, images and comments) and the user's comments elsewhere (cascading
      // to replies), then dismiss the reports left on any of them.
      const [packResult, commentResult] = await db.batch([
        db.delete(packs).where(inArray(packs.id, packIds)),
        db.delete(comments).where(eq(comments.userId, userId)),
        dismissReportsOnDeletedTargets(db),
      ]);
      const packsDeleted = packResult.meta.changes;
      const commentsDeleted = commentResult.meta.changes;

      // 4. Delete every stored object of those packs (best-effort)
      let filesDeleted = 0;
      for (const packId of packIds) {
        filesDeleted += await removePackObjects(c.env.BUCKET, packId);
      }

      logger.info(
        {
          actorId: actor.id,
          userId,
          packsDeleted,
          commentsDeleted,
          filesDeleted,
        },
        "User banned and content purged"
      );

      return c.json(
        {
          success: true,
          purged: {
            packs: packsDeleted,
            comments: commentsDeleted,
            files: filesDeleted,
          },
        },
        200
      );
    }
  );

export default app;
