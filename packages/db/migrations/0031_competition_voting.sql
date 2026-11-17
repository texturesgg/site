CREATE TABLE `competition_announcements` (
	`competition` text PRIMARY KEY NOT NULL,
	`announced_at` integer NOT NULL,
	`announced_by` text,
	FOREIGN KEY (`announced_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `competition_entries` (
	`competition` text NOT NULL,
	`code_mod_id` text NOT NULL,
	`entered_by` text,
	`entered_at` integer NOT NULL,
	`final_votes` integer,
	PRIMARY KEY(`competition`, `code_mod_id`),
	FOREIGN KEY (`code_mod_id`) REFERENCES `code_mods`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`entered_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `competition_follow_claims` (
	`competition` text NOT NULL,
	`user_id` text NOT NULL,
	`x_account_id` text NOT NULL,
	`claimed_at` integer NOT NULL,
	PRIMARY KEY(`competition`, `user_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `competition_votes` (
	`id` text PRIMARY KEY NOT NULL,
	`competition` text NOT NULL,
	`code_mod_id` text NOT NULL,
	`user_id` text NOT NULL,
	`bonus` integer NOT NULL,
	`account_created_at` integer NOT NULL,
	`sign_in_methods` text NOT NULL,
	`x_account_id` text,
	`ip_hash` text NOT NULL,
	`country` text,
	`created_at` integer NOT NULL,
	`voided_at` integer,
	`voided_by` text,
	`void_reason` text,
	FOREIGN KEY (`code_mod_id`) REFERENCES `code_mods`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`voided_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `competition_vote_idx` ON `competition_votes` (`competition`,`user_id`,`code_mod_id`);--> statement-breakpoint
CREATE INDEX `competition_vote_mod_idx` ON `competition_votes` (`competition`,`code_mod_id`);--> statement-breakpoint
CREATE TABLE `x_handles` (
	`account_id` text PRIMARY KEY NOT NULL,
	`handle` text NOT NULL,
	`seen_at` integer NOT NULL
);
