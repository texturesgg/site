import { zValidator } from "@hono/zod-validator";
import {
  codeMods,
  competitionEntries,
  competitionFollowClaims,
  competitionVotes,
  createDb,
} from "@vgskins/db";
import { logger } from "@vgskins/logger";
import {
  COMPETITION,
  type CompetitionState,
  codeModSlugSchema,
  competitionBudget,
  competitionOpen,
  enterCompetitionSchema,
  generateId,
} from "@vgskins/shared";
import { and, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { z } from "zod";
import { optionalAuth, requireAuth } from "../lib/auth";
import {
  cantVote,
  castVote,
  closedReason,
  dropEntryVotes,
  entryBySlug,
  ipHash,
  linkedX,
  listEntries,
  me,
  ownMods,
  trimVotes,
  voterSnapshot,
} from "../lib/competition";
import { requireCodeMods } from "../lib/feature-flags";
import { getClientIp, rateLimitByUser } from "../lib/rate-limit";
import { validationHook } from "../lib/validation";
import type { HonoEnv } from "../types";

// The December 2026 mod competition: entries, votes and the follow bonus.
// Everything is behind the code-mods flag; every rule is enforced here.

const ID = COMPETITION.id;
const ModParam = z.object({ mod: codeModSlugSchema });
/** Where Cloudflare places the request (request.cf), for the audit's country. */
const Place = z.object({ country: z.string().max(8).optional() }).catch({});

const limitChanges = rateLimitByUser((env) => env.RATE_LIMIT_VOTE);

const app = new Hono<HonoEnv>()
  .get(
    "/",
    describeRoute({
      tags: ["Competition"],
      summary: "The competition",
      description:
        "Its dates, whether it's open, and its entries with public vote counts, most votes first and ties by who entered first (CompetitionState). For a signed-in account, `me` adds its votes, how many it has, its X link and follow claim, and its own mods with whether each can be entered.",
      responses: { 200: { description: "The competition" } },
    }),
    optionalAuth,
    requireCodeMods,
    async (c) => {
      const db = createDb(c.env.DB);
      const user = c.get("user");
      const now = Date.now();
      const body: CompetitionState = {
        competition: ID,
        opens: COMPETITION.opens,
        closes: COMPETITION.closes,
        open: competitionOpen(now),
        entries: await listEntries(db, new URL(c.req.url).origin),
        me: user ? await me(db, user.id, now) : null,
      };
      c.header("Cache-Control", "no-store");
      return c.json(body, 200);
    }
  )

  // Vote for an entry
  .put(
    "/votes/:mod",
    requireAuth,
    requireCodeMods,
    limitChanges,
    zValidator("param", ModParam, validationHook),
    async (c) => {
      const db = createDb(c.env.DB);
      const user = c.get("user");
      const closed = closedReason(Date.now());
      if (closed) return c.json({ error: closed }, 403);
      const why = await cantVote(db, user.id);
      if (why) return c.json({ error: why }, 403);

      const entry = await entryBySlug(db, c.req.valid("param").mod);
      if (!entry) return c.json({ error: "That mod isn't an entry." }, 404);
      if (entry.userId === user.id) {
        return c.json({ error: "You can't vote for your own mod." }, 403);
      }

      const slug = c.req.valid("param").mod;
      const snapshot = await voterSnapshot(db, user.id);
      const outcome = await castVote(db, {
        id: generateId(),
        codeModId: entry.id,
        userId: user.id,
        ...snapshot,
        ipHash: await ipHash(c.env.BETTER_AUTH_SECRET, getClientIp(c)),
        country: Place.parse(c.req.raw.cf ?? {}).country ?? null,
        createdAt: new Date(),
      });
      if (outcome === "budget_full") {
        return c.json({ error: "You've used all your votes. Take one back to move it." }, 409);
      }
      if (outcome === "inserted") logger.info({ userId: user.id, mod: slug }, "Competition vote");
      return c.json({ success: true }, 200);
    }
  )

  // Take a vote back (a voided one stays)
  .delete(
    "/votes/:mod",
    requireAuth,
    requireCodeMods,
    limitChanges,
    zValidator("param", ModParam, validationHook),
    async (c) => {
      const db = createDb(c.env.DB);
      const user = c.get("user");
      const closed = closedReason(Date.now());
      if (closed) return c.json({ error: closed }, 403);
      const [mod] = await db
        .select({ id: codeMods.id })
        .from(codeMods)
        .where(eq(codeMods.slug, c.req.valid("param").mod));
      if (mod) {
        await db
          .delete(competitionVotes)
          .where(
            and(
              eq(competitionVotes.competition, ID),
              eq(competitionVotes.userId, user.id),
              eq(competitionVotes.codeModId, mod.id),
              isNull(competitionVotes.voidedAt)
            )
          );
      }
      return c.json({ success: true }, 200);
    }
  )

  // "I follow @texturesgg": the extra votes, with X linked
  .put("/follow", requireAuth, requireCodeMods, limitChanges, async (c) => {
    const db = createDb(c.env.DB);
    const user = c.get("user");
    const closed = closedReason(Date.now());
    if (closed) return c.json({ error: closed }, 403);
    const why = await cantVote(db, user.id);
    if (why) return c.json({ error: why }, 403);
    const x = await linkedX(db, user.id);
    if (!x) return c.json({ error: "Link your X account first." }, 409);
    const inserted = await db
      .insert(competitionFollowClaims)
      .values({ competition: ID, userId: user.id, xAccountId: x.accountId, claimedAt: new Date() })
      .onConflictDoNothing()
      .returning({ userId: competitionFollowClaims.userId });
    if (inserted.length === 0) {
      const [ownClaim] = await db
        .select({ xAccountId: competitionFollowClaims.xAccountId })
        .from(competitionFollowClaims)
        .where(
          and(
            eq(competitionFollowClaims.competition, ID),
            eq(competitionFollowClaims.userId, user.id)
          )
        );
      if (ownClaim?.xAccountId === x.accountId) return c.json({ success: true }, 200);
      if (ownClaim) {
        return c.json({ error: "You already claimed extra votes with another X account." }, 409);
      }
      return c.json({ error: "This X account has already been used to claim extra votes." }, 409);
    }
    return c.json({ success: true }, 200);
  })

  // Withdraw the follow claim: the newest votes past one go back
  .delete("/follow", requireAuth, requireCodeMods, limitChanges, async (c) => {
    const db = createDb(c.env.DB);
    const user = c.get("user");
    const closed = closedReason(Date.now());
    if (closed) return c.json({ error: closed }, 403);
    await db
      .delete(competitionFollowClaims)
      .where(
        and(
          eq(competitionFollowClaims.competition, ID),
          eq(competitionFollowClaims.userId, user.id)
        )
      );
    await trimVotes(db, user.id, competitionBudget(false));
    return c.json({ success: true }, 200);
  })

  // Enter one of your mods with its post on X, or change the post
  .put(
    "/entries/:mod",
    describeRoute({
      tags: ["Competition"],
      summary: "Enter a mod",
      description:
        "Enters one of your own mods with the post on X that shares it (EnterCompetition), or replaces the post when it's already entered. The post must be an x.com or twitter.com status link. It's stored as https://x.com/<handle>/status/<id> and nothing is fetched from X.",
      responses: { 200: { description: "Entered" } },
    }),
    requireAuth,
    requireCodeMods,
    limitChanges,
    zValidator("param", ModParam, validationHook),
    zValidator("json", enterCompetitionSchema, validationHook),
    async (c) => {
      const db = createDb(c.env.DB);
      const user = c.get("user");
      const closed = closedReason(Date.now());
      if (closed) return c.json({ error: closed }, 403);
      const [owned] = await db
        .select({ id: codeMods.id })
        .from(codeMods)
        .where(and(eq(codeMods.slug, c.req.valid("param").mod), eq(codeMods.userId, user.id)));
      if (!owned) return c.json({ error: "Only the mod's owner can enter it." }, 403);
      const [mod] = await ownMods(db, user.id, owned.id);
      if (mod?.why) return c.json({ error: mod.why }, 409);
      const postUrl = c.req.valid("json").post_url;
      await db
        .insert(competitionEntries)
        .values({
          competition: ID,
          codeModId: owned.id,
          enteredBy: user.id,
          enteredAt: new Date(),
          postUrl,
        })
        .onConflictDoUpdate({
          target: [competitionEntries.competition, competitionEntries.codeModId],
          set: { postUrl },
        });
      logger.info({ userId: user.id, mod: c.req.valid("param").mod }, "Competition entry");
      return c.json({ success: true }, 200);
    }
  )

  // Take your mod out: its votes go back to their voters
  .delete(
    "/entries/:mod",
    requireAuth,
    requireCodeMods,
    limitChanges,
    zValidator("param", ModParam, validationHook),
    async (c) => {
      const db = createDb(c.env.DB);
      const user = c.get("user");
      const closed = closedReason(Date.now());
      if (closed) return c.json({ error: closed }, 403);
      const [owned] = await db
        .select({ id: codeMods.id })
        .from(codeMods)
        .where(and(eq(codeMods.slug, c.req.valid("param").mod), eq(codeMods.userId, user.id)));
      if (!owned) return c.json({ error: "Only the mod's owner can take it out." }, 403);
      await db
        .delete(competitionEntries)
        .where(
          and(eq(competitionEntries.competition, ID), eq(competitionEntries.codeModId, owned.id))
        );
      await dropEntryVotes(db, owned.id);
      return c.json({ success: true }, 200);
    }
  );

export default app;
