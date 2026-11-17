import { z } from "zod";

/**
 * The December 2026 mod competition: who can enter, who can vote, and what
 * the API answers. The API enforces every rule here; the site only shows them.
 */

/** Entries and voting run from the start of Dec 1 to the end of Dec 31, Pacific time. */
export const COMPETITION = {
  id: "2026-12",
  opens: "2026-12-01T08:00:00.000Z",
  closes: "2027-01-01T08:00:00.000Z",
} as const;

/** Every account's vote, and the extra ones for following @texturesgg with X linked. */
export const COMPETITION_BASE_VOTES = 1;
export const COMPETITION_FOLLOW_VOTES = 2;
export const COMPETITION_X_HANDLE = "texturesgg";

/** Votes and follow claims are deleted this long after the winners are announced. */
export const COMPETITION_AUDIT_DAYS = 90;

/** Whether entering and voting are open at `now` (ms). */
export function competitionOpen(now: number): boolean {
  return now >= Date.parse(COMPETITION.opens) && now < Date.parse(COMPETITION.closes);
}

/** How many votes an account has: one, plus the follow votes when it claimed with X linked. */
export function competitionBudget(followed: boolean): number {
  return COMPETITION_BASE_VOTES + (followed ? COMPETITION_FOLLOW_VOTES : 0);
}

/** What decides whether a mod can be entered. */
export type EntryFacts = {
  official: boolean;
  deleted: boolean;
  /** Whether it has an approved release now. */
  listed: boolean;
  /** When its first release of any status was recorded (ms), or null for none. */
  firstReleaseAt: number | null;
};

/** Why a mod can't be entered, or null when it can. */
export function entryIneligible(mod: EntryFacts): string | null {
  if (mod.official) return "Official mods aren't entries.";
  if (mod.deleted) return "This mod was removed.";
  if (mod.firstReleaseAt === null || !mod.listed) {
    return "It can be entered once a release is approved.";
  }
  if (mod.firstReleaseAt < Date.parse(COMPETITION.opens)) {
    return "Only mods first released on or after Dec 1 can enter.";
  }
  return null;
}

/** What decides whether an account can vote. */
export type VoterFacts = {
  role: "user" | "moderator" | "admin";
  emailVerified: boolean;
  banned: boolean;
};

/** Why an account can't vote at all, or null when it can. */
export function voterIneligible(voter: VoterFacts): string | null {
  if (voter.role !== "user") return "Moderators and admins don't vote.";
  if (voter.banned) return "This account can't vote.";
  if (!voter.emailVerified) return "Verify your email to vote.";
  return null;
}

/** A flag the audit puts on a vote. */
export const COMPETITION_FLAGS = ["new_account", "burst", "shared_ip"] as const;
export const competitionFlagSchema = z.enum(COMPETITION_FLAGS);
export type CompetitionFlag = z.infer<typeof competitionFlagSchema>;

/** A new account: under this old when it voted, or made after entries opened. */
export const NEW_ACCOUNT_MS = 7 * 24 * 60 * 60 * 1000;
/** A burst: this many votes for one mod from new accounts within BURST_MS. */
export const BURST_VOTES = 5;
export const BURST_MS = 10 * 60 * 1000;
/** A shared IP: this many accounts voting from one IP hash. */
export const SHARED_IP_ACCOUNTS = 3;

export type AuditVote = {
  id: string;
  modId: string;
  userId: string;
  ipHash: string;
  accountCreatedAt: number;
  createdAt: number;
};

/** The flags on each vote, by vote id. Voided votes should be left out of `votes`. */
export function competitionAuditFlags(votes: readonly AuditVote[]): Map<string, CompetitionFlag[]> {
  const flags = new Map<string, CompetitionFlag[]>(votes.map((vote) => [vote.id, []]));
  const add = (id: string, flag: CompetitionFlag) => {
    const list = flags.get(id);
    if (list && !list.includes(flag)) list.push(flag);
  };
  const opens = Date.parse(COMPETITION.opens);
  const isNew = (vote: AuditVote) =>
    vote.createdAt - vote.accountCreatedAt < NEW_ACCOUNT_MS || vote.accountCreatedAt >= opens;

  for (const vote of votes) if (isNew(vote)) add(vote.id, "new_account");

  const byMod = new Map<string, AuditVote[]>();
  for (const vote of votes.filter(isNew).sort((a, b) => a.createdAt - b.createdAt)) {
    byMod.set(vote.modId, [...(byMod.get(vote.modId) ?? []), vote]);
  }
  for (const list of byMod.values()) {
    // Each window of BURST_MS that starts at a vote and holds BURST_VOTES or more.
    for (let start = 0; start < list.length; start++) {
      const window = list.filter(
        (vote, i) => i >= start && vote.createdAt - list[start].createdAt <= BURST_MS
      );
      if (window.length >= BURST_VOTES) for (const vote of window) add(vote.id, "burst");
    }
  }

  const accountsByIp = new Map<string, Set<string>>();
  for (const vote of votes) {
    const accounts = accountsByIp.get(vote.ipHash) ?? new Set<string>();
    accounts.add(vote.userId);
    accountsByIp.set(vote.ipHash, accounts);
  }
  for (const vote of votes) {
    if ((accountsByIp.get(vote.ipHash)?.size ?? 0) >= SHARED_IP_ACCOUNTS) add(vote.id, "shared_ip");
  }
  return flags;
}

// ---------------------------------------------------------------------------
// GET /api/competition
// ---------------------------------------------------------------------------

/** An entry as everyone sees it, with its public count (voided votes left out). */
export const competitionEntrySchema = z.object({
  /** The mod id (its slug). */
  id: z.string(),
  name: z.string(),
  author: z.string(),
  icon: z.string().nullable(),
  votes: z.number().int().min(0),
  entered_at: z.string(),
});
export type CompetitionEntry = z.infer<typeof competitionEntrySchema>;

/** One of the viewer's own mods and whether it's entered or can be. */
export const competitionOwnModSchema = z.object({
  id: z.string(),
  name: z.string(),
  entered: z.boolean(),
  /** Why it can't be entered, or null. */
  why: z.string().nullable(),
});
export type CompetitionOwnMod = z.infer<typeof competitionOwnModSchema>;

export const competitionMeSchema = z.object({
  /** The mods this account voted for (ids), voided ones included. */
  votes: z.array(z.string()),
  /** How many votes it has in all. */
  budget: z.number().int().min(0),
  /** Why it can't vote, or null. */
  why: z.string().nullable(),
  x: z.object({
    linked: z.boolean(),
    /** Its X handle, as X reported it, when linked. */
    handle: z.string().nullable(),
    claimed: z.boolean(),
  }),
  mods: z.array(competitionOwnModSchema),
});
export type CompetitionMe = z.infer<typeof competitionMeSchema>;

/** Entries by votes, most first, ties by who entered first. */
export const competitionStateSchema = z.object({
  competition: z.string(),
  opens: z.string(),
  closes: z.string(),
  open: z.boolean(),
  entries: z.array(competitionEntrySchema),
  me: competitionMeSchema.nullable(),
});
export type CompetitionState = z.infer<typeof competitionStateSchema>;

// ---------------------------------------------------------------------------
// The admin audit
// ---------------------------------------------------------------------------

export const competitionVoterSchema = z.object({
  vote: z.string(),
  user: z.object({ id: z.string(), name: z.string() }),
  account_created_at: z.string(),
  sign_in_methods: z.array(z.string()),
  /** The X account linked when it voted, with the handle X reported, if known. */
  x: z.object({ account_id: z.string(), handle: z.string().nullable() }).nullable(),
  follow_claim: z.boolean(),
  bonus: z.boolean(),
  voted_at: z.string(),
  /** The first characters of the salted IP hash, enough to match. */
  ip: z.string(),
  country: z.string().nullable(),
  flags: z.array(competitionFlagSchema),
  voided: z.object({ at: z.string(), by: z.string().nullable(), reason: z.string() }).nullable(),
});
export type CompetitionVoter = z.infer<typeof competitionVoterSchema>;

export const competitionAuditEntrySchema = competitionEntrySchema.extend({
  voters: z.array(competitionVoterSchema),
});
export type CompetitionAuditEntry = z.infer<typeof competitionAuditEntrySchema>;

export const competitionAuditSchema = z.object({
  competition: z.string(),
  announced_at: z.string().nullable(),
  entries: z.array(competitionAuditEntrySchema),
});
export type CompetitionAudit = z.infer<typeof competitionAuditSchema>;

/** Voiding a vote, or all of an account's votes: why, which the record keeps. */
export const voidCompetitionVotesSchema = z.object({
  reason: z.string().trim().min(1, "Say why").max(500),
});
export type VoidCompetitionVotes = z.infer<typeof voidCompetitionVotesSchema>;
