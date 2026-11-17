import { env } from "cloudflare:test";
import {
  codeMods,
  competitionAnnouncements,
  competitionFollowClaims,
  competitionVotes,
  createDb,
  games,
  users,
} from "@vgskins/db";
import { describe, expect, it } from "vitest";
import { sweepCompetitionAudit } from "./competition-sweep";

const db = createDb(env.DB);
const DAY = 24 * 60 * 60 * 1000;

describe("the competition sweep", () => {
  it("deletes votes and follow claims 90 days after the winners are announced", async () => {
    const announced = new Date("2027-01-05T18:00:00.000Z");
    await db.insert(users).values({
      id: "voter",
      name: "voter",
      email: "voter@example.com",
      createdAt: announced,
      updatedAt: announced,
    });
    await db.insert(games).values({
      id: "g",
      name: "Melee",
      slug: "melee-sweep",
      shortName: "SSBM",
      createdAt: announced,
      updatedAt: announced,
    });
    await db.insert(codeMods).values({
      id: "m",
      userId: "voter",
      gameId: "g",
      slug: "me.mod",
      name: "Mod",
      sourceKind: "push",
      createdAt: announced,
      updatedAt: announced,
    });
    await db.insert(competitionVotes).values({
      id: "v",
      competition: "2026-12",
      codeModId: "m",
      userId: "voter",
      bonus: false,
      accountCreatedAt: announced,
      signInMethods: ["discord"],
      ipHash: "hash",
      createdAt: announced,
    });
    await db.insert(competitionFollowClaims).values({
      competition: "2026-12",
      userId: "voter",
      xAccountId: "1",
      claimedAt: announced,
    });
    await db
      .insert(competitionAnnouncements)
      .values({ competition: "2026-12", announcedAt: announced });

    await sweepCompetitionAudit(db, new Date(announced.getTime() + 89 * DAY));
    expect(await db.select().from(competitionVotes)).toHaveLength(1);

    await sweepCompetitionAudit(db, new Date(announced.getTime() + 90 * DAY));
    expect(await db.select().from(competitionVotes)).toHaveLength(0);
    expect(await db.select().from(competitionFollowClaims)).toHaveLength(0);
  });
});
