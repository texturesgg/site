import { comments, type Database, packs, reports } from "@vgskins/db";
import { and, eq, notExists, or } from "drizzle-orm";

/**
 * Dismiss every pending report whose pack or comment no longer exists. Run it
 * in the same batch as a hard delete; a report cascaded away with its target
 * would otherwise wait forever. resolvedBy stays null: nobody reviewed it.
 */
export function dismissReportsOnDeletedTargets(db: Database) {
  const gone = (table: typeof packs | typeof comments) =>
    notExists(db.select({ id: table.id }).from(table).where(eq(table.id, reports.targetId)));
  return db
    .update(reports)
    .set({ status: "dismissed", resolvedAt: new Date() })
    .where(
      and(
        eq(reports.status, "pending"),
        or(
          and(eq(reports.targetType, "pack"), gone(packs)),
          and(eq(reports.targetType, "comment"), gone(comments))
        )
      )
    );
}

/** Delete a comment, its replies (through the foreign key), and reports left on them. */
export function deleteComment(db: Database, commentId: string) {
  return db.batch([
    db.delete(comments).where(eq(comments.id, commentId)),
    dismissReportsOnDeletedTargets(db),
  ]);
}
