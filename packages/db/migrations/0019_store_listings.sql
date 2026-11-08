CREATE TABLE `code_mod_release_images` (
	`release_id` text NOT NULL,
	`kind` text NOT NULL,
	`position` integer NOT NULL,
	`sha256` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	PRIMARY KEY(`release_id`, `kind`, `position`),
	FOREIGN KEY (`release_id`) REFERENCES `code_mod_releases`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `code_mod_release_image_sha256_idx` ON `code_mod_release_images` (`sha256`);--> statement-breakpoint
ALTER TABLE `code_mod_releases` ADD `readme` text;--> statement-breakpoint
ALTER TABLE `code_mod_releases` ADD `changelog` text;--> statement-breakpoint
ALTER TABLE `code_mod_releases` ADD `tags` text;--> statement-breakpoint
ALTER TABLE `code_mod_releases` ADD `homepage` text;--> statement-breakpoint
ALTER TABLE `code_mod_releases` ADD `listed_at` integer;