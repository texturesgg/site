CREATE TABLE `feature_flag_users` (
	`flag_key` text NOT NULL,
	`user_id` text NOT NULL,
	FOREIGN KEY (`flag_key`) REFERENCES `feature_flags`(`key`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ff_user_idx` ON `feature_flag_users` (`flag_key`,`user_id`);--> statement-breakpoint
CREATE TABLE `feature_flags` (
	`key` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`description` text,
	`created_at` integer NOT NULL
);
