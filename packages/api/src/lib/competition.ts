import {
  accounts,
  codeModReleases,
  codeMods,
  competitionEntries,
  competitionFollowClaims,
  competitionVotes,
  type Database,
  users,
  xHandles,
} from "@vgskins/db";
import {
  COMPETITION,
  COMPETITION_BASE_VOTES,
  COMPETITION_FOLLOW_VOTES,
  type CompetitionEntry,
  type CompetitionMe,
  competitionBudget,
  competitionOpen,
  entryIneligible,
  voterIneligible,
} from "@vgskins/shared";
import { and, count, desc, eq, inArray, isNotNull, isNull, min, sql } from "drizzle-orm";
import { notBanned } from "./queries";
import { currentPort, listedMods, MOD_COLUMNS, summarize } from "./registry-listing";

/**
 * The December 2026 competition's data: entries, votes, follow claims. The
 * rules themselves are in packages/shared/src/competition.ts.
 */

const ID = COMPETITION.id;

/** Why entering or voting can't happen now, or null while they're open. */
export function closedReason(now: number): string | null {
  if (competitionOpen(now)) return null;
  return now < Date.parse(COMPETITION.opens) ? "Voting opens Dec 4." : "Voting is closed.";
}

/** Each entry's public count: unvoided votes from accounts that aren't banned. */
async function voteCounts(db: Database): Promise<Map<string, number>> {
  const rows = await db
    .select({ codeModId: competitionVotes.codeModId, votes: count() })
    .from(competitionVotes)
    .innerJoin(users, eq(users.id, competitionVotes.userId))
    .where(
      and(eq(competitionVotes.competition, ID), isNull(competitionVotes.voidedAt), notBanned())
    )
    .groupBy(competitionVotes.codeModId);
  return new Map(rows.map((row) => [row.codeModId, row.votes]));
}

/**
 * The entries that are listed now, most votes first, ties by who entered first.
 * Once winners are announced (`finalVotes` set), uses the frozen final count
 * unless `options.live` is set (so results survive the 90-day audit sweep).
 */
export async function listEntries(
  db: Database,
  origin: string,
  options?: { live?: boolean }
): Promise<CompetitionEntry[]> {
  const [rows, counts, port] = await Promise.all([
    db
      .select({
        ...MOD_COLUMNS,
        enteredAt: competitionEntries.enteredAt,
        postUrl: competitionEntries.postUrl,
        finalVotes: competitionEntries.finalVotes,
      })
      .from(competitionEntries)
      .innerJoin(codeMods, eq(codeMods.id, competitionEntries.codeModId))
      .innerJoin(users, eq(users.id, codeMods.userId))
      .where(
        and(
          eq(competitionEntries.competition, ID),
          isNotNull(competitionEntries.postUrl),
          listedMods(db)
        )
      ),
    voteCounts(db),
    currentPort(db),
  ]);
  const summaries = new Map(
    (await summarize(db, origin, rows, port)).map((summary) => [summary.id, summary])
  );
  return rows
    .flatMap(({ postUrl, finalVotes, ...row }) =>
      postUrl === null
        ? []
        : [
            {
              id: row.slug,
              name: row.name,
              author: row.author,
              icon: summaries.get(row.slug)?.icon?.url ?? null,
              votes: options?.live
                ? (counts.get(row.id) ?? 0)
                : (finalVotes ?? counts.get(row.id) ?? 0),
              entered_at: row.enteredAt.toISOString(),
              post_url: postUrl,
            },
          ]
    )
    .sort((a, b) => b.votes - a.votes || a.entered_at.localeCompare(b.entered_at));
}

/** The facts entering a mod depends on, for mods owned by `userId` (or one mod). */
export async function ownMods(db: Database, userId: string, modId?: string) {
  const rows = await db
    .select({
      id: codeMods.id,
      slug: codeMods.slug,
      name: codeMods.name,
      userId: codeMods.userId,
      official: codeMods.official,
      deletedAt: codeMods.deletedAt,
      firstReleaseAt: min(codeModReleases.createdAt),
      approved: sql<number>`sum(${codeModReleases.status} = 'approved')`,
      postUrl: competitionEntries.postUrl,
    })
    .from(codeMods)
    .leftJoin(codeModReleases, eq(codeModReleases.codeModId, codeMods.id))
    .leftJoin(
      competitionEntries,
      and(eq(competitionEntries.competition, ID), eq(competitionEntries.codeModId, codeMods.id))
    )
    .where(and(eq(codeMods.userId, userId), modId ? eq(codeMods.id, modId) : undefined))
    .groupBy(codeMods.id);
  return rows
    .filter((row) => modId !== undefined || row.deletedAt === null)
    .map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      entered: row.postUrl !== null,
      post_url: row.postUrl,
      why: entryIneligible({
        official: row.official,
        deleted: row.deletedAt !== null,
        listed: Number(row.approved) > 0,
        firstReleaseAt: row.firstReleaseAt ? row.firstReleaseAt.getTime() : null,
      }),
    }));
}

/** The account's linked X account, with the handle X reported, if any. */
export async function linkedX(db: Database, userId: string) {
  const [row] = await db
    .select({ accountId: accounts.accountId, handle: xHandles.handle })
    .from(accounts)
    .leftJoin(xHandles, eq(xHandles.accountId, accounts.accountId))
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "twitter")));
  return row ?? null;
}

/**
 * Whether `userId` currently holds an active follow claim: a claim row whose X
 * account is still linked to this account.
 */
export async function hasClaimed(db: Database, userId: string): Promise<boolean> {
  const [claim] = await db
    .select({ userId: competitionFollowClaims.userId })
    .from(competitionFollowClaims)
    .innerJoin(
      accounts,
      and(
        eq(accounts.userId, competitionFollowClaims.userId),
        eq(accounts.providerId, "twitter"),
        eq(accounts.accountId, competitionFollowClaims.xAccountId)
      )
    )
    .where(
      and(eq(competitionFollowClaims.competition, ID), eq(competitionFollowClaims.userId, userId))
    );
  return Boolean(claim);
}

/** Why `userId` can't vote at all (role, ban, email), or null. */
export async function cantVote(db: Database, userId: string): Promise<string | null> {
  const [voter] = await db
    .select({
      role: users.role,
      emailVerified: users.emailVerified,
      banned: users.banned,
      banExpires: users.banExpires,
    })
    .from(users)
    .where(eq(users.id, userId));
  if (!voter) return "This account can't vote.";
  const banned =
    Boolean(voter.banned) && (!voter.banExpires || voter.banExpires.getTime() > Date.now());
  return voterIneligible({ role: voter.role, emailVerified: voter.emailVerified, banned });
}

/**
 * The account's votes on currently listed entries in this competition, newest
 * first, voided ones included (withdrawn or deleted entries don't hold a slot).
 */
export async function votesOf(db: Database, userId: string) {
  return db
    .select({
      id: competitionVotes.id,
      slug: codeMods.slug,
      bonus: competitionVotes.bonus,
      voided: competitionVotes.voidedAt,
      createdAt: competitionVotes.createdAt,
    })
    .from(competitionVotes)
    .innerJoin(
      competitionEntries,
      and(
        eq(competitionEntries.competition, competitionVotes.competition),
        eq(competitionEntries.codeModId, competitionVotes.codeModId)
      )
    )
    .innerJoin(codeMods, eq(codeMods.id, competitionVotes.codeModId))
    .where(
      and(
        eq(competitionVotes.competition, ID),
        eq(competitionVotes.userId, userId),
        isNotNull(competitionEntries.postUrl),
        listedMods(db)
      )
    )
    .orderBy(desc(competitionVotes.createdAt));
}

/** What the signed-in account sees: its votes, how many it has, X and its own mods. */
export async function me(db: Database, userId: string, now: number): Promise<CompetitionMe> {
  const [votes, x, claimed, why, mods] = await Promise.all([
    votesOf(db, userId),
    linkedX(db, userId),
    hasClaimed(db, userId),
    cantVote(db, userId),
    ownMods(db, userId),
  ]);
  const closed = closedReason(now);
  return {
    votes: votes.map((vote) => vote.slug),
    budget: competitionBudget(claimed),
    why: why ?? closed,
    x: { linked: Boolean(x), handle: x?.handle ?? null, claimed },
    mods: mods.map((mod) => ({
      id: mod.slug,
      name: mod.name,
      entered: mod.entered,
      post_url: mod.post_url,
      why: mod.why ?? (mod.entered ? null : closed),
    })),
  };
}

/** The entry for mod `slug` as a voter targets it: listed and entered, or null. */
export async function entryBySlug(db: Database, slug: string) {
  const [row] = await db
    .select({ id: codeMods.id, userId: codeMods.userId })
    .from(competitionEntries)
    .innerJoin(codeMods, eq(codeMods.id, competitionEntries.codeModId))
    .where(
      and(
        eq(competitionEntries.competition, ID),
        eq(codeMods.slug, slug),
        isNotNull(competitionEntries.postUrl),
        listedMods(db)
      )
    );
  return row ?? null;
}

/** A salted hash of the IP: matches the same address, can't be turned back into it. */
export async function ipHash(secret: string, ip: string): Promise<string> {
  const encode = (value: string) => new TextEncoder().encode(value);
  const key = await crypto.subtle.importKey(
    "raw",
    encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, encode(`vote-ip:${ip}`)));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** What the audit copies about the account when it votes. */
export async function voterSnapshot(db: Database, userId: string) {
  const [[user], methods] = await Promise.all([
    db.select({ createdAt: users.createdAt }).from(users).where(eq(users.id, userId)),
    db
      .select({ providerId: accounts.providerId, accountId: accounts.accountId })
      .from(accounts)
      .where(eq(accounts.userId, userId)),
  ]);
  return {
    accountCreatedAt: user?.createdAt ?? new Date(0),
    signInMethods: methods.map((method) => method.providerId).sort(),
    xAccountId: methods.find((method) => method.providerId === "twitter")?.accountId ?? null,
  };
}

/**
 * Atomically inserts a vote if the user has remaining budget on active listed
 * entries, computing `bonus` from whether their base slot is already filled.
 * Prevents concurrent requests from exceeding the voter's budget.
 */
export async function castVote(
  db: Database,
  input: {
    id: string;
    codeModId: string;
    userId: string;
    accountCreatedAt: Date;
    signInMethods: string[];
    xAccountId: string | null;
    ipHash: string;
    country: string | null;
    createdAt: Date;
  }
): Promise<"inserted" | "exists" | "budget_full"> {
  const activeVotes = sql`
    SELECT COUNT(*)
    FROM competition_votes v
    INNER JOIN competition_entries e
      ON e.competition = v.competition AND e.code_mod_id = v.code_mod_id
    INNER JOIN code_mods m
      ON m.id = v.code_mod_id
    WHERE v.competition = ${ID}
      AND v.user_id = ${input.userId}
      AND e.post_url IS NOT NULL
      AND m.deleted_at IS NULL
      AND EXISTS (
        SELECT 1 FROM code_mod_releases r
        WHERE r.code_mod_id = m.id AND r.status = 'approved'
      )
  `;
  const activeBaseVotes = sql`
    SELECT COUNT(*)
    FROM competition_votes v
    INNER JOIN competition_entries e
      ON e.competition = v.competition AND e.code_mod_id = v.code_mod_id
    INNER JOIN code_mods m
      ON m.id = v.code_mod_id
    WHERE v.competition = ${ID}
      AND v.user_id = ${input.userId}
      AND v.bonus = 0
      AND e.post_url IS NOT NULL
      AND m.deleted_at IS NULL
      AND EXISTS (
        SELECT 1 FROM code_mod_releases r
        WHERE r.code_mod_id = m.id AND r.status = 'approved'
      )
  `;
  const activeBudget = sql`
    CASE
      WHEN EXISTS (
        SELECT 1
        FROM competition_follow_claims fc
        INNER JOIN accounts a
          ON a.user_id = fc.user_id
          AND a.provider_id = 'twitter'
          AND a.account_id = fc.x_account_id
        WHERE fc.competition = ${ID}
          AND fc.user_id = ${input.userId}
      ) THEN ${COMPETITION_BASE_VOTES + COMPETITION_FOLLOW_VOTES}
      ELSE ${COMPETITION_BASE_VOTES}
    END
  `;

  const result = await db.run(sql`
    INSERT OR IGNORE INTO competition_votes (
      id,
      competition,
      code_mod_id,
      user_id,
      bonus,
      account_created_at,
      sign_in_methods,
      x_account_id,
      ip_hash,
      country,
      created_at
    )
    SELECT
      ${input.id},
      ${ID},
      ${input.codeModId},
      ${input.userId},
      CASE WHEN (${activeBaseVotes}) >= ${COMPETITION_BASE_VOTES} THEN 1 ELSE 0 END,
      ${input.accountCreatedAt.getTime()},
      ${JSON.stringify(input.signInMethods)},
      ${input.xAccountId},
      ${input.ipHash},
      ${input.country},
      ${input.createdAt.getTime()}
    WHERE (${activeVotes}) < (${activeBudget})
  `);

  if ((result.meta?.changes ?? 0) > 0) return "inserted";

  const [existing] = await db
    .select({ id: competitionVotes.id })
    .from(competitionVotes)
    .where(
      and(
        eq(competitionVotes.competition, ID),
        eq(competitionVotes.userId, input.userId),
        eq(competitionVotes.codeModId, input.codeModId)
      )
    );
  return existing ? "exists" : "budget_full";
}

/** Deletes an entry's votes, so its voters get them back (an entry taken out). */
export async function dropEntryVotes(db: Database, modId: string) {
  await db
    .delete(competitionVotes)
    .where(and(eq(competitionVotes.competition, ID), eq(competitionVotes.codeModId, modId)));
}

/**
 * Takes back votes past `budget` (after a follow claim is withdrawn or X is
 * unlinked), dropping bonus votes first (newest first) before base votes.
 */
export async function trimVotes(db: Database, userId: string, budget: number) {
  const votes = await votesOf(db, userId);
  const over = votes.length - budget;
  if (over <= 0) return;
  const removable = votes
    .filter((vote) => vote.voided === null)
    .sort(
      (a, b) => Number(b.bonus) - Number(a.bonus) || b.createdAt.getTime() - a.createdAt.getTime()
    )
    .slice(0, over);
  if (removable.length === 0) return;
  await db.delete(competitionVotes).where(
    inArray(
      competitionVotes.id,
      removable.map((vote) => vote.id)
    )
  );
}
