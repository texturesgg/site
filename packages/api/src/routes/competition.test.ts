import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import {
  accounts,
  codeModReleases,
  codeMods,
  competitionVotes,
  createDb,
  games,
  users,
  xHandles,
} from "@vgskins/db";
import { COMPETITION, competitionAuditSchema, competitionStateSchema } from "@vgskins/shared";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { signIn } from "../test/session";
import type { HonoEnv } from "../types";
import adminCompetitionRoutes from "./admin-competition";
import competitionRoutes from "./competition";

// The December competition's rules, as the owner set them: mods first
// released from Dec 1 enter once entries open Dec 4 (official ones never), one
// vote per account plus two with X linked and the follow claimed, no votes for
// your own mod or from staff, voting closes at the end of Dec 18 Pacific,
// counts are public and a voided vote drops out of them.
const db = createDb(env.DB);
const app = new Hono<HonoEnv>()
  .route("/api/competition", competitionRoutes)
  .route("/api/admin/competition", adminCompetitionRoutes);
const ELIGIBLE_FROM = Date.parse(COMPETITION.eligibleFrom);
const OPENS = Date.parse(COMPETITION.opens);
const DAY = 24 * 60 * 60 * 1000;
/** The post on X that shares an entry. */
const POST = { post_url: "https://twitter.com/maker/status/1863000000000000000?s=20" };

async function call(path: string, cookie: string, method = "GET", body?: unknown) {
  const ctx = createExecutionContext();
  const response = await app.request(
    path,
    {
      method,
      headers: {
        cookie,
        "cf-connecting-ip": "203.0.113.7",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
    env,
    ctx
  );
  await waitOnExecutionContext(ctx);
  return response;
}

/** A minute passes, so votes have distinct times. */
function later() {
  vi.setSystemTime(Date.now() + 60_000);
}

async function state(cookie: string) {
  return competitionStateSchema.parse(await (await call("/api/competition", cookie)).json());
}

/** A mod owned by `owner`, its first release at `firstRelease`, approved. */
async function addMod(slug: string, owner: string, firstRelease: number, official = false) {
  await db.insert(codeMods).values({
    id: slug,
    userId: owner,
    gameId: "melee",
    slug,
    name: slug,
    sourceKind: "push",
    official,
    createdAt: new Date(firstRelease),
    updatedAt: new Date(firstRelease),
  });
  await db.insert(codeModReleases).values({
    id: `${slug}@1.0.0`,
    codeModId: slug,
    version: "1.0.0",
    tag: "1.0.0",
    commitSha: "0".repeat(40),
    status: "approved",
    createdAt: new Date(firstRelease),
    updatedAt: new Date(firstRelease),
  });
}

let maker: string;
let rival: string;
let voter: string;
let follower: string;
let moderator: string;
let admin: string;

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(OPENS + 10 * DAY);
  vi.spyOn(env.FLAGS, "getBooleanValue").mockResolvedValue(true);
  maker = await signIn(db, "maker");
  rival = await signIn(db, "rival");
  voter = await signIn(db, "voter");
  follower = await signIn(db, "follower");
  moderator = await signIn(db, "moderator", "moderator");
  admin = await signIn(db, "admin", "admin");
  await db.insert(games).values({
    id: "melee",
    name: "Super Smash Bros. Melee",
    slug: "melee",
    shortName: "Melee",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await addMod("maker.new", "maker", ELIGIBLE_FROM + DAY);
  await addMod("maker.old", "maker", ELIGIBLE_FROM - DAY);
  await addMod("rival.new", "rival", OPENS + 2 * DAY);
  await addMod("tgg.rules", "admin", OPENS + DAY, true);
  await db.insert(accounts).values({
    id: "follower-x",
    userId: "follower",
    accountId: "4242",
    providerId: "twitter",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await db
    .insert(xHandles)
    .values({ accountId: "4242", handle: "real_follower", seenAt: new Date() });
});

afterAll(() => {
  vi.useRealTimers();
});

describe("the competition", () => {
  it("enters a mod only with a link to its post on X", async () => {
    const notX = await call("/api/competition/entries/maker.new", maker, "PUT", {
      post_url: "https://example.com/maker/status/1",
    });
    expect(notX.status).toBe(400);
    expect((await call("/api/competition/entries/maker.new", maker, "PUT")).status).toBe(400);
    expect((await state(voter)).entries).toEqual([]);
  });

  it("takes mods first released from Dec 1, never official ones or someone else's", async () => {
    expect((await call("/api/competition/entries/maker.new", maker, "PUT", POST)).status).toBe(200);
    const old = await call("/api/competition/entries/maker.old", maker, "PUT", POST);
    expect(old.status).toBe(409);
    expect(await old.json()).toEqual({
      error: "Only mods first released on or after Dec 1 can enter.",
    });
    expect((await call("/api/competition/entries/tgg.rules", admin, "PUT", POST)).status).toBe(409);
    expect((await call("/api/competition/entries/rival.new", maker, "PUT", POST)).status).toBe(403);
    expect((await call("/api/competition/entries/rival.new", rival, "PUT", POST)).status).toBe(200);

    const mine = (await state(maker)).me?.mods;
    expect(mine).toEqual([
      {
        id: "maker.new",
        name: "maker.new",
        entered: true,
        post_url: "https://x.com/maker/status/1863000000000000000",
        why: null,
      },
      {
        id: "maker.old",
        name: "maker.old",
        entered: false,
        post_url: null,
        why: "Only mods first released on or after Dec 1 can enter.",
      },
    ]);
  });

  it("gives one vote, never for your own mod or to staff", async () => {
    expect((await call("/api/competition/votes/maker.new", maker, "PUT")).status).toBe(403);
    expect((await call("/api/competition/votes/maker.new", moderator, "PUT")).status).toBe(403);
    expect((await call("/api/competition/votes/maker.new", voter, "PUT")).status).toBe(200);
    const second = await call("/api/competition/votes/rival.new", voter, "PUT");
    expect(second.status).toBe(409);

    // Moving it: take it back, vote again.
    expect((await call("/api/competition/votes/maker.new", voter, "DELETE")).status).toBe(200);
    expect((await call("/api/competition/votes/rival.new", voter, "PUT")).status).toBe(200);
    expect((await state(voter)).me).toMatchObject({ votes: ["rival.new"], budget: 1 });
  });

  it("gives two more with X linked and the follow claimed", async () => {
    expect((await call("/api/competition/follow", voter, "PUT")).status).toBe(409);
    expect((await call("/api/competition/follow", follower, "PUT")).status).toBe(200);
    expect((await state(follower)).me).toMatchObject({
      budget: 3,
      x: { linked: true, handle: "real_follower", claimed: true },
    });
    expect((await call("/api/competition/votes/maker.new", follower, "PUT")).status).toBe(200);
    later();
    expect((await call("/api/competition/votes/rival.new", follower, "PUT")).status).toBe(200);

    // Withdrawing the claim gives back the newest vote past one.
    expect((await call("/api/competition/follow", follower, "DELETE")).status).toBe(200);
    expect((await state(follower)).me).toMatchObject({ votes: ["maker.new"], budget: 1 });
    expect((await call("/api/competition/follow", follower, "PUT")).status).toBe(200);
    expect((await call("/api/competition/votes/rival.new", follower, "PUT")).status).toBe(200);
  });

  it("shows counts most first, and a voided vote drops out of them", async () => {
    expect((await state(voter)).entries.map((entry) => [entry.id, entry.votes])).toEqual([
      ["rival.new", 2],
      ["maker.new", 1],
    ]);

    const audit = competitionAuditSchema.parse(
      await (await call("/api/admin/competition", admin)).json()
    );
    const rivalVoters = audit.entries.find((entry) => entry.id === "rival.new")?.voters ?? [];
    const followerVote = rivalVoters.find((vote) => vote.user.name === "follower");
    expect(followerVote).toMatchObject({
      x: { account_id: "4242", handle: "real_follower" },
      follow_claim: true,
      bonus: true,
      sign_in_methods: ["twitter"],
    });
    expect((await call("/api/admin/competition", moderator)).status).toBe(403);

    const voided = await call(
      `/api/admin/competition/votes/${followerVote?.vote}/void`,
      admin,
      "POST",
      { reason: "Test account" }
    );
    expect(voided.status).toBe(200);
    expect((await state(voter)).entries.map((entry) => [entry.id, entry.votes])).toEqual([
      ["maker.new", 1],
      ["rival.new", 1],
    ]);
  });

  it("enforces the vote budget atomically under concurrent requests", async () => {
    const racer = await signIn(db, "racer");
    const responses = await Promise.all([
      call("/api/competition/votes/maker.new", racer, "PUT"),
      call("/api/competition/votes/rival.new", racer, "PUT"),
    ]);
    expect(responses.map((res) => res.status).sort()).toEqual([200, 409]);
    expect((await state(racer)).me?.votes).toHaveLength(1);
    // Clean up racer's vote so later count assertions stay predictable.
    const voted = (await state(racer)).me?.votes[0];
    if (voted) await call(`/api/competition/votes/${voted}`, racer, "DELETE");
  });

  it("prevents reusing one X account across users and drops budget if X is unlinked", async () => {
    const second = await signIn(db, "second_x");
    // Move the twitter link off `follower` onto `second_x` without unclaiming first.
    await db
      .delete(accounts)
      .where(and(eq(accounts.userId, "follower"), eq(accounts.providerId, "twitter")));
    expect((await state(follower)).me).toMatchObject({
      budget: 1,
      x: { linked: false, claimed: false },
    });

    await db.insert(accounts).values({
      id: "second-x-link",
      userId: "second_x",
      accountId: "4242",
      providerId: "twitter",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const reused = await call("/api/competition/follow", second, "PUT");
    expect(reused.status).toBe(409);
    expect(await reused.json()).toEqual({
      error: "This X account has already been used to claim extra votes.",
    });

    // Re-link X back to follower so its claim stays valid for later checks.
    await db.delete(accounts).where(eq(accounts.id, "second-x-link"));
    await db.insert(accounts).values({
      id: "follower-x-restored",
      userId: "follower",
      accountId: "4242",
      providerId: "twitter",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect((await state(follower)).me).toMatchObject({
      budget: 3,
      x: { linked: true, claimed: true },
    });
  });

  it("excludes banned users from public counts and marks them in the audit", async () => {
    const bad = await signIn(db, "banned_voter");
    const before = (await state(voter)).entries.find((entry) => entry.id === "maker.new")!.votes;
    expect((await call("/api/competition/votes/maker.new", bad, "PUT")).status).toBe(200);
    expect((await state(voter)).entries.find((entry) => entry.id === "maker.new")!.votes).toBe(
      before + 1
    );

    await db.update(users).set({ banned: true }).where(eq(users.id, "banned_voter"));
    expect((await state(voter)).entries.find((entry) => entry.id === "maker.new")!.votes).toBe(
      before
    );
    const audit = competitionAuditSchema.parse(
      await (await call("/api/admin/competition", admin)).json()
    );
    const row = audit.entries
      .find((entry) => entry.id === "maker.new")
      ?.voters.find((vote) => vote.user.id === "banned_voter");
    expect(row).toMatchObject({ banned: true, flags: [] });
  });

  it("frees a voter's slot when an entered mod is withdrawn", async () => {
    await addMod("maker.pulled", "maker", ELIGIBLE_FROM + DAY);
    expect((await call("/api/competition/entries/maker.pulled", maker, "PUT", POST)).status).toBe(
      200
    );
    const freed = await signIn(db, "freed_voter");
    expect((await call("/api/competition/votes/maker.pulled", freed, "PUT")).status).toBe(200);
    expect((await call("/api/competition/votes/maker.new", freed, "PUT")).status).toBe(409);

    // Moderator withdraws the release: mod leaves the listing and frees the voter's budget.
    await db
      .update(codeModReleases)
      .set({ status: "withdrawn" })
      .where(eq(codeModReleases.codeModId, "maker.pulled"));
    expect((await state(freed)).me?.votes).toEqual([]);
    expect((await call("/api/competition/votes/maker.new", freed, "PUT")).status).toBe(200);
    await call("/api/competition/votes/maker.new", freed, "DELETE");
  });

  it("assigns base vs bonus accurately after unvoting and trims bonus votes first", async () => {
    await addMod("rival.two", "rival", OPENS + 2 * DAY);
    expect((await call("/api/competition/entries/rival.two", rival, "PUT", POST)).status).toBe(200);

    const swapper = await signIn(db, "swapper");
    await db.insert(accounts).values({
      id: "swapper-x",
      userId: "swapper",
      accountId: "9999",
      providerId: "twitter",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect((await call("/api/competition/follow", swapper, "PUT")).status).toBe(200);

    // Vote 1 -> base, Vote 2 -> bonus, remove Vote 1, cast Vote 3 -> base (not bonus).
    expect((await call("/api/competition/votes/maker.new", swapper, "PUT")).status).toBe(200);
    later();
    expect((await call("/api/competition/votes/rival.new", swapper, "PUT")).status).toBe(200);
    later();
    expect((await call("/api/competition/votes/maker.new", swapper, "DELETE")).status).toBe(200);
    later();
    expect((await call("/api/competition/votes/rival.two", swapper, "PUT")).status).toBe(200);

    const audit = competitionAuditSchema.parse(
      await (await call("/api/admin/competition", admin)).json()
    );
    const baseVote = audit.entries
      .find((entry) => entry.id === "rival.two")
      ?.voters.find((vote) => vote.user.id === "swapper");
    const bonusVote = audit.entries
      .find((entry) => entry.id === "rival.new")
      ?.voters.find((vote) => vote.user.id === "swapper");
    expect(baseVote?.bonus).toBe(false);
    expect(bonusVote?.bonus).toBe(true);

    // Unclaiming drops the bonus vote first, keeping the base vote on rival.two.
    expect((await call("/api/competition/follow", swapper, "DELETE")).status).toBe(200);
    expect((await state(swapper)).me?.votes).toEqual(["rival.two"]);
    await call("/api/competition/votes/rival.two", swapper, "DELETE");
  });

  it("closes at the end of Dec 18 Pacific and keeps final counts after sweep", async () => {
    vi.setSystemTime(Date.parse(COMPETITION.closes) - 1000);
    const late = await signIn(db, "late");
    expect((await call("/api/competition/votes/maker.new", late, "PUT")).status).toBe(200);

    vi.setSystemTime(Date.parse(COMPETITION.closes));
    const after = await signIn(db, "after");
    const closed = await call("/api/competition/votes/maker.new", after, "PUT");
    expect(closed.status).toBe(403);
    expect(await closed.json()).toEqual({ error: "Voting is closed." });
    expect((await state(after)).open).toBe(false);

    // Announce winners, then simulate the 90-day audit sweep deleting competition_votes.
    const liveBefore = (await state(voter)).entries.map((entry) => [entry.id, entry.votes]);
    expect((await call("/api/admin/competition/announced", admin, "POST")).status).toBe(200);
    await db.delete(competitionVotes).where(eq(competitionVotes.competition, COMPETITION.id));
    expect((await state(voter)).entries.map((entry) => [entry.id, entry.votes])).toEqual(
      liveBefore
    );
  });
});
