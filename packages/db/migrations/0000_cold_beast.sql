CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`id_token` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `provider_account_idx` ON `accounts` (`provider_id`,`account_id`);--> statement-breakpoint
CREATE TABLE `collection_items` (
	`id` text PRIMARY KEY NOT NULL,
	`collection_id` text NOT NULL,
	`pack_id` text NOT NULL,
	`sort_order` integer DEFAULT 0,
	`added_at` integer NOT NULL,
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`pack_id`) REFERENCES `packs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `collection_item_unique_idx` ON `collection_items` (`collection_id`,`pack_id`);--> statement-breakpoint
CREATE INDEX `collection_item_collection_idx` ON `collection_items` (`collection_id`);--> statement-breakpoint
CREATE TABLE `collections` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`thumbnail_key` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `collection_user_slug_idx` ON `collections` (`user_id`,`slug`);--> statement-breakpoint
CREATE INDEX `collection_user_idx` ON `collections` (`user_id`);--> statement-breakpoint
CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`pack_id` text NOT NULL,
	`user_id` text NOT NULL,
	`parent_id` text,
	`body` text NOT NULL,
	`source` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`pack_id`) REFERENCES `packs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `comments_pack_idx` ON `comments` (`pack_id`);--> statement-breakpoint
CREATE INDEX `comments_user_idx` ON `comments` (`user_id`);--> statement-breakpoint
CREATE INDEX `comments_parent_idx` ON `comments` (`parent_id`);--> statement-breakpoint
CREATE TABLE `downloads` (
	`id` text PRIMARY KEY NOT NULL,
	`pack_id` text NOT NULL,
	`user_id` text,
	`downloaded_at` integer NOT NULL,
	FOREIGN KEY (`pack_id`) REFERENCES `packs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `download_pack_idx` ON `downloads` (`pack_id`);--> statement-breakpoint
CREATE INDEX `download_user_idx` ON `downloads` (`user_id`);--> statement-breakpoint
CREATE TABLE `favorites` (
	`user_id` text NOT NULL,
	`pack_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`pack_id`) REFERENCES `packs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `favorite_user_pack_idx` ON `favorites` (`user_id`,`pack_id`);--> statement-breakpoint
CREATE TABLE `games` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`short_name` text NOT NULL,
	`platform` text,
	`icon_key` text,
	`banner_key` text,
	`config` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `games_slug_unique` ON `games` (`slug`);--> statement-breakpoint
CREATE TABLE `mods` (
	`id` text PRIMARY KEY NOT NULL,
	`pack_id` text NOT NULL,
	`slot_id` text NOT NULL,
	`file_key` text NOT NULL,
	`file_name` text NOT NULL,
	`label` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`pack_id`) REFERENCES `packs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`slot_id`) REFERENCES `target_slots`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `mod_pack_idx` ON `mods` (`pack_id`);--> statement-breakpoint
CREATE INDEX `mod_slot_idx` ON `mods` (`slot_id`);--> statement-breakpoint
CREATE TABLE `pack_images` (
	`id` text PRIMARY KEY NOT NULL,
	`pack_id` text NOT NULL,
	`image_key` text NOT NULL,
	`sort_order` integer DEFAULT 0,
	FOREIGN KEY (`pack_id`) REFERENCES `packs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `pack_images_pack_idx` ON `pack_images` (`pack_id`);--> statement-breakpoint
CREATE TABLE `pack_tags` (
	`pack_id` text NOT NULL,
	`tag_id` text NOT NULL,
	FOREIGN KEY (`pack_id`) REFERENCES `packs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pack_tag_idx` ON `pack_tags` (`pack_id`,`tag_id`);--> statement-breakpoint
CREATE TABLE `packs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`game_id` text NOT NULL,
	`target_id` text NOT NULL,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`thumbnail_key` text,
	`status` text DEFAULT 'processing' NOT NULL,
	`download_count` integer DEFAULT 0 NOT NULL,
	`source` text,
	`source_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`published_at` integer,
	`deleted_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_id`) REFERENCES `targets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pack_game_slug_idx` ON `packs` (`game_id`,`slug`);--> statement-breakpoint
CREATE INDEX `pack_user_idx` ON `packs` (`user_id`);--> statement-breakpoint
CREATE INDEX `pack_target_idx` ON `packs` (`target_id`);--> statement-breakpoint
CREATE INDEX `pack_status_idx` ON `packs` (`status`);--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`reporter_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`reason` text NOT NULL,
	`details` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`resolved_by` text,
	`resolved_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`reporter_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resolved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `report_status_idx` ON `reports` (`status`);--> statement-breakpoint
CREATE INDEX `report_target_idx` ON `reports` (`target_type`,`target_id`);--> statement-breakpoint
CREATE INDEX `report_reporter_idx` ON `reports` (`reporter_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token` text NOT NULL,
	`expires_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_unique` ON `sessions` (`token`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_unique` ON `tags` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `tags_slug_unique` ON `tags` (`slug`);--> statement-breakpoint
CREATE TABLE `target_slots` (
	`id` text PRIMARY KEY NOT NULL,
	`target_id` text NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`target_id`) REFERENCES `targets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `target_slot_name_idx` ON `target_slots` (`target_id`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `target_slot_order_idx` ON `target_slots` (`target_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `target_slot_target_idx` ON `target_slots` (`target_id`);--> statement-breakpoint
CREATE TABLE `targets` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`category` text NOT NULL,
	`icon_key` text,
	`model_key` text,
	`sort_order` integer DEFAULT 0,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `target_game_slug_idx` ON `targets` (`game_id`,`slug`);--> statement-breakpoint
CREATE INDEX `target_game_idx` ON `targets` (`game_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`role` text DEFAULT 'user' NOT NULL,
	`banned` integer DEFAULT false,
	`ban_reason` text,
	`ban_expires` integer,
	`bio` text,
	`pronouns` text,
	`show_discord` integer DEFAULT false,
	`show_twitter` integer DEFAULT false,
	`show_github` integer DEFAULT false,
	`twitter_handle` text,
	`github_username` text,
	`website_url` text,
	`onboarding_completed` integer DEFAULT false NOT NULL,
	`source` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_name_unique` ON `users` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `votes` (
	`user_id` text NOT NULL,
	`pack_id` text NOT NULL,
	`source` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`pack_id`) REFERENCES `packs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vote_user_pack_idx` ON `votes` (`user_id`,`pack_id`);--> statement-breakpoint
CREATE INDEX `vote_pack_idx` ON `votes` (`pack_id`);