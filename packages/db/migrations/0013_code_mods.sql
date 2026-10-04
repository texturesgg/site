CREATE TABLE `code_mod_builds` (
	`id` text PRIMARY KEY NOT NULL,
	`release_id` text NOT NULL,
	`layout_id` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`run_id` text,
	`image` text,
	`package_key` text,
	`package_sha256` text,
	`package_size` integer,
	`manifest` text,
	`canonical_hooks` text,
	`log_key` text,
	`signature` text,
	`error` text,
	`created_at` integer NOT NULL,
	`finished_at` integer,
	FOREIGN KEY (`release_id`) REFERENCES `code_mod_releases`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`layout_id`) REFERENCES `code_mod_layouts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `code_mod_build_release_layout_idx` ON `code_mod_builds` (`release_id`,`layout_id`);--> statement-breakpoint
CREATE INDEX `code_mod_build_layout_idx` ON `code_mod_builds` (`layout_id`,`status`);--> statement-breakpoint
CREATE TABLE `code_mod_layouts` (
	`id` text PRIMARY KEY NOT NULL,
	`api` text NOT NULL,
	`port` text NOT NULL,
	`target` text NOT NULL,
	`port_version` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `code_mod_releases` (
	`id` text PRIMARY KEY NOT NULL,
	`code_mod_id` text NOT NULL,
	`version` text NOT NULL,
	`tag` text NOT NULL,
	`commit_sha` text NOT NULL,
	`netplay` text NOT NULL,
	`license` text,
	`status` text DEFAULT 'processing' NOT NULL,
	`error` text,
	`reviewed_by` text,
	`reviewed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`published_at` integer,
	FOREIGN KEY (`code_mod_id`) REFERENCES `code_mods`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `code_mod_release_version_idx` ON `code_mod_releases` (`code_mod_id`,`version`);--> statement-breakpoint
CREATE INDEX `code_mod_release_status_idx` ON `code_mod_releases` (`status`,`published_at`);--> statement-breakpoint
CREATE TABLE `code_mods` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`game_id` text NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`source_kind` text NOT NULL,
	`source_url` text,
	`download_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `code_mods_slug_unique` ON `code_mods` (`slug`);--> statement-breakpoint
CREATE INDEX `code_mod_user_idx` ON `code_mods` (`user_id`);--> statement-breakpoint
CREATE INDEX `code_mod_game_idx` ON `code_mods` (`game_id`);