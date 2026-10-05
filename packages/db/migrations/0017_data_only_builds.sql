PRAGMA defer_foreign_keys = on;--> statement-breakpoint
-- Rebuild code_mod_builds so layout_id can be null (a package without a
-- library serves every layout). No table references code_mod_builds, so
-- dropping the old one cascades into nothing.
CREATE TABLE `__new_code_mod_builds` (
	`id` text PRIMARY KEY NOT NULL,
	`release_id` text NOT NULL,
	`layout_id` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`run_id` text,
	`image` text,
	`package_key` text,
	`package_sha256` text,
	`package_size` integer,
	`manifest` text,
	`canonical_hooks` text,
	`netplay` text,
	`log_key` text,
	`signature` text,
	`error` text,
	`created_at` integer NOT NULL,
	`finished_at` integer,
	FOREIGN KEY (`release_id`) REFERENCES `code_mod_releases`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`layout_id`) REFERENCES `code_mod_layouts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_code_mod_builds`("id", "release_id", "layout_id", "status", "run_id", "image", "package_key", "package_sha256", "package_size", "manifest", "canonical_hooks", "netplay", "log_key", "signature", "error", "created_at", "finished_at") SELECT "id", "release_id", "layout_id", "status", "run_id", "image", "package_key", "package_sha256", "package_size", "manifest", "canonical_hooks", "netplay", "log_key", "signature", "error", "created_at", "finished_at" FROM `code_mod_builds`;--> statement-breakpoint
DROP TABLE `code_mod_builds`;--> statement-breakpoint
ALTER TABLE `__new_code_mod_builds` RENAME TO `code_mod_builds`;--> statement-breakpoint
CREATE UNIQUE INDEX `code_mod_build_release_layout_idx` ON `code_mod_builds` (`release_id`,`layout_id`);--> statement-breakpoint
CREATE INDEX `code_mod_build_layout_idx` ON `code_mod_builds` (`layout_id`,`status`);