CREATE TABLE `code_mod_release_dependencies` (
	`release_id` text NOT NULL,
	`dependency` text NOT NULL,
	`range` text NOT NULL,
	PRIMARY KEY(`release_id`, `dependency`),
	FOREIGN KEY (`release_id`) REFERENCES `code_mod_releases`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `code_mod_release_dependency_idx` ON `code_mod_release_dependencies` (`dependency`);