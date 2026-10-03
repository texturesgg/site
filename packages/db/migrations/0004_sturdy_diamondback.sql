ALTER TABLE `mods` ADD `processing_status` text DEFAULT 'succeeded' NOT NULL;--> statement-breakpoint
ALTER TABLE `mods` ADD `processing_error` text;--> statement-breakpoint
ALTER TABLE `mods` ADD `processed_at` integer;--> statement-breakpoint
ALTER TABLE `packs` ADD `expected_mod_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `packs` ADD `image_processing_status` text DEFAULT 'skipped' NOT NULL;--> statement-breakpoint
ALTER TABLE `packs` ADD `image_processing_error` text;