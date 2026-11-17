import {
  competitionAnnouncements,
  competitionFollowClaims,
  competitionVotes,
  createDb,
} from "@vgskins/db";
import { logger } from "@vgskins/logger";
import { COMPETITION_AUDIT_DAYS } from "@vgskins/shared";
import { eq, lte } from "drizzle-orm";

/**
 * Deletes a competition's votes and follow claims COMPETITION_AUDIT_DAYS after
 * its winners were announced. Each entry's count was kept when they were.
 */
export async function sweepCompetitionAudit(db: ReturnType<typeof createDb>, now: Date) {
  const cutoff = new Date(now.getTime() - COMPETITION_AUDIT_DAYS * 24 * 60 * 60 * 1000);
  const due = await db
    .select({ competition: competitionAnnouncements.competition })
    .from(competitionAnnouncements)
    .where(lte(competitionAnnouncements.announcedAt, cutoff));
  for (const { competition } of due) {
    await db.batch([
      db.delete(competitionVotes).where(eq(competitionVotes.competition, competition)),
      db
        .delete(competitionFollowClaims)
        .where(eq(competitionFollowClaims.competition, competition)),
    ]);
    logger.info({ competition }, "Competition audit data deleted");
  }
}
