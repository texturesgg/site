CREATE TABLE `code_mod_check_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`release_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`release_id`) REFERENCES `code_mod_releases`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `code_mod_check_run_user_idx` ON `code_mod_check_runs` (`user_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `code_mods` ADD `publisher_name` text;--> statement-breakpoint
ALTER TABLE `code_mods` ADD `official` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `trusted` integer DEFAULT false NOT NULL;