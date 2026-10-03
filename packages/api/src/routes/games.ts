import { zValidator } from "@hono/zod-validator";
import { createDb, games, packs, targetSlots, targets, votes } from "@vgskins/db";
import { logger } from "@vgskins/logger";
import { TARGET_CATEGORIES } from "@vgskins/shared";
import { and, asc, count, eq, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { writeAnalyticsEvent } from "../lib/analytics";
import { optionalAuth } from "../lib/auth";
import { loadPack } from "../lib/queries";
import { validationHook } from "../lib/validation";
import type { HonoEnv } from "../types";

const app = new Hono<HonoEnv>()
  // Get all games
  .get("/", async (c) => {
    const db = createDb(c.env.DB);

    logger.info("Listing games");

    const allGames = await db.query.games.findMany({
      orderBy: (games, { desc }) => [desc(games.createdAt)],
    });

    const packCounts = await db
      .select({
        gameId: packs.gameId,
        count: sql<number>`count(*)`,
      })
      .from(packs)
      .where(and(eq(packs.status, "approved"), isNull(packs.deletedAt)))
      .groupBy(packs.gameId);

    const countMap = new Map(packCounts.map((r) => [r.gameId, r.count]));

    return c.json(
      allGames.map((game) => ({
        ...game,
        packCount: countMap.get(game.id) ?? 0,
      })),
      200
    );
  })
  // Get single game by slug
  .get("/:slug", async (c) => {
    const db = createDb(c.env.DB);
    const slug = c.req.param("slug");

    logger.info({ slug }, "Getting game");

    const game = await db.query.games.findFirst({
      where: eq(games.slug, slug),
    });

    if (!game) {
      logger.warn({ slug }, "Game not found");
      return c.json({ error: "Game not found" }, 404);
    }

    return c.json(game, 200);
  })
  // Get targets for a game, with slots included
  .get(
    "/:slug/targets",
    zValidator(
      "query",
      z.object({
        category: z.enum(TARGET_CATEGORIES).optional(),
      }),
      validationHook
    ),
    async (c) => {
      const db = createDb(c.env.DB);
      const slug = c.req.param("slug");
      const query = c.req.valid("query");

      logger.info({ slug, category: query.category }, "Getting targets for game");

      const game = await db.query.games.findFirst({
        where: eq(games.slug, slug),
      });

      if (!game) {
        logger.warn({ slug }, "Game not found for targets");
        return c.json({ error: "Game not found" }, 404);
      }

      const conditions = [eq(targets.gameId, game.id)];
      if (query.category) {
        conditions.push(eq(targets.category, query.category));
      }

      const [result, counts] = await Promise.all([
        db.query.targets.findMany({
          where: and(...conditions),
          orderBy: [asc(targets.sortOrder)],
          with: {
            slots: {
              orderBy: [asc(targetSlots.sortOrder)],
            },
          },
        }),
        // Public pack counts per target, for the Browse filter.
        db
          .select({ targetId: packs.targetId, packCount: count() })
          .from(packs)
          .where(
            and(eq(packs.gameId, game.id), eq(packs.status, "approved"), isNull(packs.deletedAt))
          )
          .groupBy(packs.targetId),
      ]);
      const countByTarget = new Map(counts.map((row) => [row.targetId, row.packCount]));

      return c.json(
        result.map((target) => ({ ...target, packCount: countByTarget.get(target.id) ?? 0 })),
        200
      );
    }
  )
  // Get pack by game slug and pack slug
  .get("/:slug/packs/:packSlug", optionalAuth, async (c) => {
    const db = createDb(c.env.DB);
    const user = c.get("user");
    const slug = c.req.param("slug");
    const packSlug = c.req.param("packSlug");

    logger.info({ gameSlug: slug, packSlug }, "Getting pack by slug");

    const result = await loadPack(
      db,
      { gameSlug: slug, slug: packSlug },
      {
        requester: user,
        with: {
          game: true,
          target: true,
          user: {
            columns: {
              id: true,
              name: true,
              image: true,
              bio: true,
              pronouns: true,
            },
          },
          mods: {
            with: { slot: true },
          },
          images: true,
          packTags: {
            with: { tag: true },
          },
        },
      }
    );
    if (!result) {
      return c.json({ error: "Pack not found" }, 404);
    }

    writeAnalyticsEvent(c.env.ANALYTICS, {
      version: 1,
      type: "pack_view",
      packId: result.id,
    });

    const [[{ voteCount }], userVote] = await Promise.all([
      db.select({ voteCount: count() }).from(votes).where(eq(votes.packId, result.id)),
      user
        ? db.query.votes.findFirst({
            where: and(eq(votes.packId, result.id), eq(votes.userId, user.id)),
            columns: { userId: true },
          })
        : undefined,
    ]);
    const voted = Boolean(userVote);

    const tagList = result.packTags?.map((pt) => pt.tag).filter(Boolean) ?? [];

    const { packTags: _packTags, ...pack } = result;

    return c.json(
      {
        ...pack,
        voteCount,
        voted,
        tags: tagList,
        mods: result.mods.map((m) => ({
          ...m,
          slotName: m.slot?.name ?? "Unknown",
          slotSortOrder: m.slot?.sortOrder ?? 0,
        })),
      },
      200
    );
  });

export default app;
