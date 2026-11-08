CREATE TABLE `code_mod_set_mods` (
	`set_name` text NOT NULL,
	`mod` text NOT NULL,
	`range` text NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`set_name`, `mod`),
	FOREIGN KEY (`set_name`) REFERENCES `code_mod_sets`(`name`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `code_mod_sets` (
	`name` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`version` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `code_mod_layouts` ADD `builder` text DEFAULT 'image' NOT NULL;