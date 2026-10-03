ALTER TABLE `mods` ADD `glb_generation_status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `mods` ADD `glb_converter_version` integer;--> statement-breakpoint
ALTER TABLE `mods` ADD `glb_generation_error` text;--> statement-breakpoint
ALTER TABLE `mods` ADD `glb_processed_at` integer;--> statement-breakpoint
UPDATE `mods`
SET
  `glb_generation_status` = CASE
    WHEN `glb_key` IS NOT NULL THEN 'generated'
    WHEN `processing_status` = 'failed' THEN 'failed'
    WHEN `processing_status` = 'processing' THEN 'processing'
    WHEN `processed_at` IS NOT NULL THEN 'no_mesh'
    ELSE 'pending'
  END,
  `glb_converter_version` = CASE
    WHEN `glb_key` IS NOT NULL OR `processed_at` IS NOT NULL THEN 1
    ELSE NULL
  END,
  `glb_generation_error` = CASE
    WHEN `processing_status` = 'failed' THEN `processing_error`
    ELSE NULL
  END,
  `glb_processed_at` = `processed_at`;