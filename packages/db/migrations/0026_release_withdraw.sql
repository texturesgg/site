ALTER TABLE `code_mod_releases` ADD `withdraw_reason` text;--> statement-breakpoint
ALTER TABLE `code_mod_releases` ADD `withdraw_mode` text;--> statement-breakpoint
ALTER TABLE `code_mod_releases` ADD `withdrawn_by` text REFERENCES users(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `code_mod_releases` ADD `withdrawn_at` integer;