ALTER TABLE `targets` ADD `native_hsd_animation_key` text;
--> statement-breakpoint
UPDATE `targets`
SET `native_hsd_animation_key` = 'games/melee/native-hsd-animation/v1/38b8a4d2e589e72579bc77a1794553be74d57911f1084e4490d590c26cb6f71e.json'
WHERE `id` = 'melee-captain-falcon';
