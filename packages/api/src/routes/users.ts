import { zValidator } from "@hono/zod-validator";
import { accounts, createDb, games, packs, targets, users, votes } from "@vgskins/db";
import { logger } from "@vgskins/logger";
import { OnboardingInput, UpdateProfileInput } from "@vgskins/shared";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  sql,
  sum,
} from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { isModerator, optionalAuth, requireAuth } from "../lib/auth";
import { LEGACY_PLACEHOLDER_USER_ID } from "../lib/legacy";
import { findUserByIdentifier, notBanned } from "../lib/queries";
import { usernameError } from "../lib/username";
import {
  PaginationQuery,
  paginationResponse,
  parsePagination,
  validationHook,
} from "../lib/validation";
import type { HonoEnv } from "../types";

const TOP_CREATORS = 8;
const COVERS_PER_CREATOR = 3;

const app = new Hono<HonoEnv>()
  // Get current user profile
  .get("/me", requireAuth, async (c) => {
    const db = createDb(c.env.DB);
    const user = c.get("user");

    const result = await db.query.users.findFirst({ where: eq(users.id, user.id) });
    if (!result) return c.json({ error: "User not found" }, 404);

    // Check which social accounts are linked (for settings toggles)
    const linkedAccounts = await db
      .select({ providerId: accounts.providerId })
      .from(accounts)
      .where(eq(accounts.userId, user.id));

    const providerSet = new Set(linkedAccounts.map((a) => a.providerId));

    return c.json(
      {
        ...result,
        hasDiscord: providerSet.has("discord"),
        hasGithub: providerSet.has("github"),
        hasTwitter: providerSet.has("twitter"),
      },
      200
    );
  })
  // Complete onboarding
  .post(
    "/me/onboarding",
    requireAuth,
    zValidator("json", OnboardingInput, validationHook),
    async (c) => {
      const db = createDb(c.env.DB);
      const user = c.get("user");
      const body = c.req.valid("json");

      logger.info({ userId: user.id, name: body.name }, "Completing onboarding");

      const nameError = await usernameError(db, body.name, user);
      if (nameError) return c.json({ error: nameError }, 400);

      const now = new Date();
      await db
        .update(users)
        .set({
          name: body.name,
          bio: body.bio || null,
          pronouns: body.pronouns || null,
          twitterHandle: body.twitterHandle || null,
          websiteUrl: body.websiteUrl || null,
          onboardingCompleted: true,
          updatedAt: now,
        })
        .where(eq(users.id, user.id));

      const updated = await db.query.users.findFirst({
        where: eq(users.id, user.id),
      });

      logger.info({ userId: user.id }, "Onboarding completed");

      return c.json(updated, 200);
    }
  )
  // Update user profile
  .put("/me", requireAuth, zValidator("json", UpdateProfileInput, validationHook), async (c) => {
    const db = createDb(c.env.DB);
    const user = c.get("user");
    const body = c.req.valid("json");

    logger.info({ userId: user.id }, "Updating profile");

    if (body.name) {
      const nameError = await usernameError(db, body.name, user);
      if (nameError) return c.json({ error: nameError }, 400);
    }

    await db
      .update(users)
      .set({
        ...(body.name && body.name !== user.name ? { name: body.name } : {}),
        bio: body.bio,
        pronouns: body.pronouns,
        ...(body.showDiscord !== undefined ? { showDiscord: body.showDiscord } : {}),
        ...(body.showTwitter !== undefined ? { showTwitter: body.showTwitter } : {}),
        ...(body.showGithub !== undefined ? { showGithub: body.showGithub } : {}),
        twitterHandle: body.twitterHandle,
        websiteUrl: body.websiteUrl,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    const updated = await db.query.users.findFirst({
      where: eq(users.id, user.id),
    });

    return c.json(updated, 200);
  })
  // Sync social usernames from linked OAuth accounts
  .post("/me/sync-socials", requireAuth, async (c) => {
    const db = createDb(c.env.DB);
    const user = c.get("user");

    const currentUser = await db.query.users.findFirst({
      where: eq(users.id, user.id),
      columns: { githubUsername: true, twitterHandle: true },
    });

    const linkedAccounts = await db.query.accounts.findMany({
      where: eq(accounts.userId, user.id),
    });

    const updates: Record<string, string> = {};

    for (const account of linkedAccounts) {
      if (account.providerId === "github" && account.accountId && !currentUser?.githubUsername) {
        try {
          const res = await fetch(`https://api.github.com/user/${account.accountId}`, {
            headers: { "User-Agent": "textures.gg" },
          });
          if (res.ok) {
            const profile = (await res.json()) as { login: string };
            updates.githubUsername = profile.login;
          } else {
            // A non-OK response (revoked token, rate limit) silently leaves the
            // handle unlinked; log the status so the cause is distinguishable.
            logger.warn(
              { userId: user.id, provider: "github", status: res.status },
              "Social profile lookup returned a non-OK response"
            );
          }
        } catch (error) {
          logger.warn(
            { userId: user.id, provider: "github", error },
            "Failed to fetch GitHub username"
          );
        }
      }

      if (account.providerId === "twitter" && account.accessToken && !currentUser?.twitterHandle) {
        try {
          const res = await fetch("https://api.x.com/2/users/me", {
            headers: { Authorization: `Bearer ${account.accessToken}` },
          });
          if (res.ok) {
            const profile = (await res.json()) as { data: { username: string } };
            updates.twitterHandle = profile.data.username;
          } else {
            // Never log the bearer token; the status alone identifies the cause.
            logger.warn(
              { userId: user.id, provider: "twitter", status: res.status },
              "Social profile lookup returned a non-OK response"
            );
          }
        } catch (error) {
          logger.warn(
            { userId: user.id, provider: "twitter", error },
            "Failed to fetch Twitter handle"
          );
        }
      }
    }

    if (Object.keys(updates).length > 0) {
      await db
        .update(users)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(users.id, user.id));
    }

    const updated = await db.query.users.findFirst({
      where: eq(users.id, user.id),
    });

    return c.json(updated, 200);
  })
  // Get top creators by approved pack count
  .get(
    "/top-creators",
    zValidator(
      "query",
      z.object({
        period: z.enum(["week", "month", "all"]).optional(),
      }),
      validationHook
    ),
    async (c) => {
      const db = createDb(c.env.DB);
      const { period } = c.req.valid("query");

      // Real, unbanned authors of public packs; the import placeholder is not a creator.
      const conditions = [
        eq(packs.status, "approved"),
        isNull(packs.deletedAt),
        ne(users.id, LEGACY_PLACEHOLDER_USER_ID),
        notBanned(),
      ];

      if (period === "week") {
        conditions.push(gte(packs.publishedAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)));
      } else if (period === "month") {
        conditions.push(gte(packs.publishedAt, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)));
      }

      // Ranked by how much their packs are used, not how many they uploaded.
      const downloadCount = sql<number>`coalesce(${sum(packs.downloadCount)}, 0)`.mapWith(Number);
      const creators = await db
        .select({
          id: users.id,
          name: users.name,
          image: users.image,
          packCount: count(packs.id),
          downloadCount,
        })
        .from(packs)
        .innerJoin(users, eq(packs.userId, users.id))
        .where(and(...conditions))
        .groupBy(users.id)
        .orderBy(desc(downloadCount), desc(count(packs.id)))
        .limit(TOP_CREATORS);

      // Each creator's three most-downloaded public packs supply their covers.
      const ranked = db
        .select({
          userId: packs.userId,
          thumbnailKey: packs.thumbnailKey,
          rank: sql<number>`row_number() over (partition by ${packs.userId} order by ${packs.downloadCount} desc, ${packs.publishedAt} desc)`.as(
            "rank"
          ),
        })
        .from(packs)
        .where(
          and(
            eq(packs.status, "approved"),
            isNull(packs.deletedAt),
            isNotNull(packs.thumbnailKey),
            inArray(
              packs.userId,
              creators.map((creator) => creator.id)
            )
          )
        )
        .as("ranked");
      const covers =
        creators.length > 0
          ? await db
              .select({ userId: ranked.userId, thumbnailKey: ranked.thumbnailKey })
              .from(ranked)
              .where(lte(ranked.rank, COVERS_PER_CREATOR))
              .orderBy(asc(ranked.rank))
          : [];

      return c.json(
        creators.map((creator) => ({
          ...creator,
          coverThumbnailKeys: covers
            .filter((cover) => cover.userId === creator.id)
            .flatMap((cover) => (cover.thumbnailKey ? [cover.thumbnailKey] : [])),
        })),
        200
      );
    }
  )
  // Get user profile by name or ID
  .get("/:identifier", async (c) => {
    const db = createDb(c.env.DB);
    const identifier = c.req.param("identifier");

    const result = await findUserByIdentifier(db, identifier);
    if (!result) return c.json({ error: "User not found" }, 404);

    // Sign-in methods: shown socials, and whether an imported account has been claimed.
    // Imported ssbmtextures accounts start with no sign-in method; signing up with the
    // same email links one (better-auth account linking), which is what claiming means.
    const needsAccounts =
      result.showDiscord ||
      result.showTwitter ||
      result.showGithub ||
      result.source === "ssbmtextures";
    const signIns = needsAccounts
      ? await db
          .select({ providerId: accounts.providerId, accountId: accounts.accountId })
          .from(accounts)
          .where(eq(accounts.userId, result.id))
      : [];
    const discordId = result.showDiscord
      ? (signIns.find((account) => account.providerId === "discord")?.accountId ?? null)
      : null;

    // Totals over public packs only: what visitors can actually see.
    const publicPacks = and(
      eq(packs.userId, result.id),
      eq(packs.status, "approved"),
      isNull(packs.deletedAt)
    );
    const [[packTotals], [likeTotals]] = await Promise.all([
      db
        .select({
          packCount: count(),
          downloadCount: sql<number>`coalesce(${sum(packs.downloadCount)}, 0)`.mapWith(Number),
        })
        .from(packs)
        .where(publicPacks),
      db
        .select({ likeCount: count() })
        .from(votes)
        .innerJoin(packs, eq(votes.packId, packs.id))
        .where(publicPacks),
    ]);

    return c.json(
      {
        id: result.id,
        name: result.name,
        image: result.image,
        // "ssbmtextures" marks an imported account that its creator can claim.
        source: result.source,
        isPlaceholder: result.id === LEGACY_PLACEHOLDER_USER_ID,
        claimable:
          result.source === "ssbmtextures" &&
          result.id !== LEGACY_PLACEHOLDER_USER_ID &&
          signIns.length === 0,
        stats: {
          packCount: packTotals.packCount,
          downloadCount: packTotals.downloadCount,
          likeCount: likeTotals.likeCount,
        },
        bio: result.bio,
        pronouns: result.pronouns,
        discordId,
        twitterHandle: result.showTwitter ? result.twitterHandle : null,
        githubUsername: result.showGithub ? result.githubUsername : null,
        websiteUrl: result.websiteUrl,
        createdAt: result.createdAt,
      },
      200
    );
  })
  // Get user's uploads. Unapproved packs are visible only to their owner and moderators.
  .get(
    "/:identifier/uploads",
    optionalAuth,
    zValidator(
      "query",
      PaginationQuery.extend({ sort: z.enum(["newest", "downloads", "likes"]).optional() }),
      validationHook
    ),
    async (c) => {
      const db = createDb(c.env.DB);
      const identifier = c.req.param("identifier");
      const query = c.req.valid("query");
      const pagination = parsePagination(query, { defaultPageSize: 20 });

      const foundUser = await findUserByIdentifier(db, identifier);
      if (!foundUser) return c.json({ error: "User not found" }, 404);

      const voteCount =
        sql<number>`(SELECT COUNT(*) FROM votes WHERE votes.pack_id = ${packs.id})`.mapWith(Number);
      const order =
        query.sort === "downloads"
          ? [desc(packs.downloadCount), desc(packs.createdAt)]
          : query.sort === "likes"
            ? [desc(voteCount), desc(packs.createdAt)]
            : [desc(packs.createdAt)];

      const viewer = c.get("user");
      const canSeeUnapproved = viewer?.id === foundUser.id || isModerator(viewer);
      const where = and(
        eq(packs.userId, foundUser.id),
        isNull(packs.deletedAt),
        canSeeUnapproved ? undefined : eq(packs.status, "approved")
      );

      const [items, [{ total }]] = await Promise.all([
        db
          .select({
            id: packs.id,
            title: packs.title,
            slug: packs.slug,
            description: packs.description,
            thumbnailKey: packs.thumbnailKey,
            downloadCount: packs.downloadCount,
            status: packs.status,
            createdAt: packs.createdAt,
            gameName: games.name,
            gameSlug: games.slug,
            targetName: targets.name,
            voteCount,
            modCount: sql<number>`(SELECT COUNT(*) FROM mods WHERE mods.pack_id = ${packs.id})`,
          })
          .from(packs)
          .leftJoin(games, eq(packs.gameId, games.id))
          .leftJoin(targets, eq(packs.targetId, targets.id))
          .where(where)
          .orderBy(...order)
          .limit(pagination.pageSize)
          .offset(pagination.offset),
        db.select({ total: count() }).from(packs).where(where),
      ]);

      return c.json(paginationResponse(items, total, pagination), 200);
    }
  )
  // Get user's liked packs
  .get("/:identifier/likes", zValidator("query", PaginationQuery, validationHook), async (c) => {
    const db = createDb(c.env.DB);
    const identifier = c.req.param("identifier");
    const pagination = parsePagination(c.req.valid("query"), { defaultPageSize: 20 });

    const foundUser = await findUserByIdentifier(db, identifier);
    if (!foundUser) return c.json({ error: "User not found" }, 404);

    const where = and(
      eq(votes.userId, foundUser.id),
      eq(packs.status, "approved"),
      isNull(packs.deletedAt)
    );

    const [items, [{ total }]] = await Promise.all([
      db
        .select({
          id: packs.id,
          title: packs.title,
          slug: packs.slug,
          description: packs.description,
          thumbnailKey: packs.thumbnailKey,
          downloadCount: packs.downloadCount,
          status: packs.status,
          createdAt: packs.createdAt,
          game: {
            id: games.id,
            name: games.name,
            slug: games.slug,
          },
          target: {
            id: targets.id,
            name: targets.name,
            slug: targets.slug,
          },
          creatorName: users.name,
          voteCount:
            sql<number>`(SELECT COUNT(*) FROM votes AS v WHERE v.pack_id = ${packs.id})`.mapWith(
              Number
            ),
          likedAt: votes.createdAt,
        })
        .from(votes)
        .innerJoin(packs, eq(votes.packId, packs.id))
        .leftJoin(games, eq(packs.gameId, games.id))
        .leftJoin(targets, eq(packs.targetId, targets.id))
        .leftJoin(users, eq(packs.userId, users.id))
        .where(where)
        .orderBy(desc(votes.createdAt))
        .limit(pagination.pageSize)
        .offset(pagination.offset),
      db
        .select({ total: count() })
        .from(votes)
        .innerJoin(packs, eq(votes.packId, packs.id))
        .where(where),
    ]);

    return c.json(paginationResponse(items, total, pagination), 200);
  });

export default app;
