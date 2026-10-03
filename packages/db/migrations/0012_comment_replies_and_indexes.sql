DROP INDEX `download_user_idx`;--> statement-breakpoint
DROP INDEX `pack_status_idx`;--> statement-breakpoint
CREATE INDEX `pack_status_published_idx` ON `packs` (`status`,`deleted_at`,`published_at`);--> statement-breakpoint
CREATE INDEX `account_user_idx` ON `accounts` (`user_id`);--> statement-breakpoint
CREATE INDEX `session_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verifications` (`identifier`);--> statement-breakpoint
PRAGMA defer_foreign_keys = on;--> statement-breakpoint
-- Rebuild comments with a self-reference so a reply goes with its parent.
-- D1 keeps foreign keys on, so the new table references itself, never the old
-- table: dropping the old table then cascades into nothing. Parents are copied
-- before replies, and a reply whose parent is already gone becomes top-level.
CREATE TABLE `__new_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`pack_id` text NOT NULL,
	`user_id` text NOT NULL,
	`parent_id` text,
	`body` text NOT NULL,
	`source` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`pack_id`) REFERENCES `packs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_id`) REFERENCES `__new_comments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_comments`("id", "pack_id", "user_id", "parent_id", "body", "source", "created_at", "updated_at")
SELECT "id", "pack_id", "user_id",
	CASE WHEN "parent_id" IN (SELECT "id" FROM `comments`) THEN "parent_id" END,
	"body", "source", "created_at", "updated_at"
FROM `comments`
ORDER BY "parent_id" IS NOT NULL AND "parent_id" IN (SELECT "id" FROM `comments`);--> statement-breakpoint
DROP TABLE `comments`;--> statement-breakpoint
ALTER TABLE `__new_comments` RENAME TO `comments`;--> statement-breakpoint
CREATE INDEX `comments_pack_idx` ON `comments` (`pack_id`);--> statement-breakpoint
CREATE INDEX `comments_user_idx` ON `comments` (`user_id`);--> statement-breakpoint
CREATE INDEX `comments_parent_idx` ON `comments` (`parent_id`);