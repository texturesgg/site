import { zValidator } from "@hono/zod-validator";
import {
  codeMods,
  competitionAnnouncements,
  competitionEntries,
  competitionFollowClaims,
  competitionVotes,
  createDb,
  users,
  xHandles,
} from "@vgskins/db";
import { logger } from "@vgskins/logger";
import {
  COMPETITION,
  type CompetitionAudit,
  competitionAuditFlags,
  competitionOpen,
  voidCompetitionVotesSchema,
} from "@vgskins/shared";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { z } from "zod";
import { requireAdmin, requireAuth } from "../lib/auth";
import { listEntries } from "../lib/competition";
import { requireCodeMods } from "../lib/feature-flags";
import { validationHook } from "../lib/validation";
import type { HonoEnv } from "../types";

// The competition's audit, for admins: who voted for what, with what the vote
// recorded about the account, flags for new accounts, bursts and shared IPs,
// and voiding with a reason. Voided votes stay on record and stop counting.

const ID = COMPETITION.id;

const app = new Hono<HonoEnv>()
  .use(requireAuth, requireAdmin, requireCodeMods)
  .get(
    "/",
    describeRoute({
      tags: ["Admin"],
      summary: "The competition audit",
      description:
        "Every listed entry with its public count and its voters (CompetitionAudit): when each voted, the account's age and sign-in methods then, its linked X account with the handle X reported, whether it claimed the follow votes, the first characters of the salted IP hash, the country, flags, and whether the vote was voided.",
      responses: { 200: { description: "The audit" } },
    }),
    async (c) => {
      const db = createDb(c.env.DB);
      const voidedBy = alias(users, "voided_by");
      const [entries, votes, claims, [announcement]] = await Promise.all([
        listEntries(db, new URL(c.req.url).origin),
        db
          .select({
            id: competitionVotes.id,
            slug: codeMods.slug,
            modId: competitionVotes.codeModId,
            userId: competitionVotes.userId,
            userName: users.name,
            bonus: competitionVotes.bonus,
            accountCreatedAt: competitionVotes.accountCreatedAt,
            signInMethods: competitionVotes.signInMethods,
            xAccountId: competitionVotes.xAccountId,
            xHandle: xHandles.handle,
            ipHash: competitionVotes.ipHash,
            country: competitionVotes.country,
            createdAt: competitionVotes.createdAt,
            voidedAt: competitionVotes.voidedAt,
            voidedBy: voidedBy.name,
            voidReason: competitionVotes.voidReason,
          })
          .from(competitionVotes)
          .innerJoin(codeMods, eq(codeMods.id, competitionVotes.codeModId))
          .innerJoin(users, eq(users.id, competitionVotes.userId))
          .leftJoin(voidedBy, eq(voidedBy.id, competitionVotes.voidedBy))
          .leftJoin(xHandles, eq(xHandles.accountId, competitionVotes.xAccountId))
          .where(eq(competitionVotes.competition, ID))
          .orderBy(competitionVotes.createdAt),
        db
          .select({ userId: competitionFollowClaims.userId })
          .from(competitionFollowClaims)
          .where(eq(competitionFollowClaims.competition, ID)),
        db
          .select()
          .from(competitionAnnouncements)
          .where(eq(competitionAnnouncements.competition, ID)),
      ]);
      const claimed = new Set(claims.map((claim) => claim.userId));
      const flags = competitionAuditFlags(
        votes
          .filter((vote) => vote.voidedAt === null)
          .map((vote) => ({
            id: vote.id,
            modId: vote.modId,
            userId: vote.userId,
            ipHash: vote.ipHash,
            accountCreatedAt: vote.accountCreatedAt.getTime(),
            createdAt: vote.createdAt.getTime(),
          }))
      );
      const body: CompetitionAudit = {
        competition: ID,
        announced_at: announcement?.announcedAt.toISOString() ?? null,
        entries: entries.map((entry) => ({
          ...entry,
          voters: votes
            .filter((vote) => vote.slug === entry.id)
            .map((vote) => ({
              vote: vote.id,
              user: { id: vote.userId, name: vote.userName },
              account_created_at: vote.accountCreatedAt.toISOString(),
              sign_in_methods: vote.signInMethods,
              x: vote.xAccountId ? { account_id: vote.xAccountId, handle: vote.xHandle } : null,
              follow_claim: claimed.has(vote.userId),
              bonus: vote.bonus,
              voted_at: vote.createdAt.toISOString(),
              ip: vote.ipHash.slice(0, 8),
              country: vote.country,
              flags: flags.get(vote.id) ?? [],
              voided:
                vote.voidedAt && vote.voidReason
                  ? {
                      at: vote.voidedAt.toISOString(),
                      by: vote.voidedBy,
                      reason: vote.voidReason,
                    }
                  : null,
            })),
        })),
      };
      c.header("Cache-Control", "no-store");
      return c.json(body, 200);
    }
  )

  // Void one vote
  .post(
    "/votes/:id/void",
    zValidator("param", z.object({ id: z.string().min(1).max(64) }), validationHook),
    zValidator("json", voidCompetitionVotesSchema, validationHook),
    async (c) => {
      const db = createDb(c.env.DB);
      const admin = c.get("user");
      const { id } = c.req.valid("param");
      const { reason } = c.req.valid("json");
      const voided = await db
        .update(competitionVotes)
        .set({ voidedAt: new Date(), voidedBy: admin.id, voidReason: reason })
        .where(
          and(
            eq(competitionVotes.competition, ID),
            eq(competitionVotes.id, id),
            isNull(competitionVotes.voidedAt)
          )
        )
        .returning({ id: competitionVotes.id });
      if (voided.length === 0) return c.json({ error: "No such vote, or it's already void." }, 404);
      logger.info({ userId: admin.id, vote: id, reason }, "Competition vote voided");
      return c.json({ voided: voided.length }, 200);
    }
  )

  // Void every vote of one account
  .post(
    "/users/:userId/void",
    zValidator("param", z.object({ userId: z.string().min(1).max(64) }), validationHook),
    zValidator("json", voidCompetitionVotesSchema, validationHook),
    async (c) => {
      const db = createDb(c.env.DB);
      const admin = c.get("user");
      const { userId } = c.req.valid("param");
      const { reason } = c.req.valid("json");
      const voided = await db
        .update(competitionVotes)
        .set({ voidedAt: new Date(), voidedBy: admin.id, voidReason: reason })
        .where(
          and(
            eq(competitionVotes.competition, ID),
            eq(competitionVotes.userId, userId),
            isNull(competitionVotes.voidedAt)
          )
        )
        .returning({ id: competitionVotes.id });
      logger.info(
        { userId: admin.id, voter: userId, count: voided.length, reason },
        "Competition votes voided"
      );
      return c.json({ voided: voided.length }, 200);
    }
  )

  // The winners are announced: keep each entry's count, and the votes go in 90 days
  .post("/announced", async (c) => {
    const db = createDb(c.env.DB);
    const admin = c.get("user");
    if (competitionOpen(Date.now()) || Date.now() < Date.parse(COMPETITION.closes)) {
      return c.json({ error: "Voting hasn't closed yet." }, 409);
    }
    const entries = await listEntries(db, new URL(c.req.url).origin);
    const mods = await db
      .select({ id: codeMods.id, slug: codeMods.slug })
      .from(codeMods)
      .where(
        inArray(
          codeMods.slug,
          entries.map((entry) => entry.id)
        )
      );
    const ids = new Map(mods.map((mod) => [mod.slug, mod.id]));
    for (const entry of entries) {
      const modId = ids.get(entry.id);
      if (!modId) continue;
      await db
        .update(competitionEntries)
        .set({ finalVotes: entry.votes })
        .where(
          and(eq(competitionEntries.competition, ID), eq(competitionEntries.codeModId, modId))
        );
    }
    await db
      .insert(competitionAnnouncements)
      .values({ competition: ID, announcedAt: new Date(), announcedBy: admin.id })
      .onConflictDoNothing();
    logger.info({ userId: admin.id }, "Competition winners announced");
    return c.json({ success: true }, 200);
  });

export default app;
