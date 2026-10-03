ALTER TABLE `target_slots` ADD `file_code` text;--> statement-breakpoint
ALTER TABLE `targets` ADD `file_code` text;--> statement-breakpoint
-- Melee file codes, verified against the fighter costume tables in the
-- doldecomp/melee decompilation (src/melee/ft/kinds/*). Slots are matched by position, which follows costume order.
UPDATE targets SET file_code = 'Mr' WHERE id = 'melee-mario';--> statement-breakpoint
UPDATE target_slots SET file_code = 'Nr' WHERE target_id = 'melee-mario' AND sort_order = 0;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Ye' WHERE target_id = 'melee-mario' AND sort_order = 1;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Bk' WHERE target_id = 'melee-mario' AND sort_order = 2;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Bu' WHERE target_id = 'melee-mario' AND sort_order = 3;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Gr' WHERE target_id = 'melee-mario' AND sort_order = 4;--> statement-breakpoint
UPDATE targets SET file_code = 'Lg' WHERE id = 'melee-luigi';--> statement-breakpoint
UPDATE target_slots SET file_code = 'Nr' WHERE target_id = 'melee-luigi' AND sort_order = 0;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Wh' WHERE target_id = 'melee-luigi' AND sort_order = 1;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Aq' WHERE target_id = 'melee-luigi' AND sort_order = 2;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Pi' WHERE target_id = 'melee-luigi' AND sort_order = 3;--> statement-breakpoint
UPDATE targets SET file_code = 'Kp' WHERE id = 'melee-bowser';--> statement-breakpoint
UPDATE target_slots SET file_code = 'Nr' WHERE target_id = 'melee-bowser' AND sort_order = 0;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Re' WHERE target_id = 'melee-bowser' AND sort_order = 1;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Bu' WHERE target_id = 'melee-bowser' AND sort_order = 2;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Bk' WHERE target_id = 'melee-bowser' AND sort_order = 3;--> statement-breakpoint
UPDATE targets SET file_code = 'Pe' WHERE id = 'melee-peach';--> statement-breakpoint
UPDATE target_slots SET file_code = 'Nr' WHERE target_id = 'melee-peach' AND sort_order = 0;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Ye' WHERE target_id = 'melee-peach' AND sort_order = 1;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Wh' WHERE target_id = 'melee-peach' AND sort_order = 2;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Bu' WHERE target_id = 'melee-peach' AND sort_order = 3;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Gr' WHERE target_id = 'melee-peach' AND sort_order = 4;--> statement-breakpoint
UPDATE targets SET file_code = 'Ys' WHERE id = 'melee-yoshi';--> statement-breakpoint
UPDATE target_slots SET file_code = 'Nr' WHERE target_id = 'melee-yoshi' AND sort_order = 0;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Re' WHERE target_id = 'melee-yoshi' AND sort_order = 1;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Bu' WHERE target_id = 'melee-yoshi' AND sort_order = 2;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Ye' WHERE target_id = 'melee-yoshi' AND sort_order = 3;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Pi' WHERE target_id = 'melee-yoshi' AND sort_order = 4;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Aq' WHERE target_id = 'melee-yoshi' AND sort_order = 5;--> statement-breakpoint
UPDATE targets SET file_code = 'Dk' WHERE id = 'melee-donkey-kong';--> statement-breakpoint
UPDATE target_slots SET file_code = 'Nr' WHERE target_id = 'melee-donkey-kong' AND sort_order = 0;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Bk' WHERE target_id = 'melee-donkey-kong' AND sort_order = 1;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Re' WHERE target_id = 'melee-donkey-kong' AND sort_order = 2;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Bu' WHERE target_id = 'melee-donkey-kong' AND sort_order = 3;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Gr' WHERE target_id = 'melee-donkey-kong' AND sort_order = 4;--> statement-breakpoint
UPDATE targets SET file_code = 'Ca' WHERE id = 'melee-captain-falcon';--> statement-breakpoint
UPDATE target_slots SET file_code = 'Nr' WHERE target_id = 'melee-captain-falcon' AND sort_order = 0;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Gy' WHERE target_id = 'melee-captain-falcon' AND sort_order = 1;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Re' WHERE target_id = 'melee-captain-falcon' AND sort_order = 2;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Wh' WHERE target_id = 'melee-captain-falcon' AND sort_order = 3;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Gr' WHERE target_id = 'melee-captain-falcon' AND sort_order = 4;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Bu' WHERE target_id = 'melee-captain-falcon' AND sort_order = 5;--> statement-breakpoint
UPDATE targets SET file_code = 'Gn' WHERE id = 'melee-ganondorf';--> statement-breakpoint
UPDATE target_slots SET file_code = 'Nr' WHERE target_id = 'melee-ganondorf' AND sort_order = 0;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Re' WHERE target_id = 'melee-ganondorf' AND sort_order = 1;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Bu' WHERE target_id = 'melee-ganondorf' AND sort_order = 2;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Gr' WHERE target_id = 'melee-ganondorf' AND sort_order = 3;--> statement-breakpoint
UPDATE target_slots SET file_code = 'La' WHERE target_id = 'melee-ganondorf' AND sort_order = 4;--> statement-breakpoint
UPDATE targets SET file_code = 'Fc' WHERE id = 'melee-falco';--> statement-breakpoint
UPDATE target_slots SET file_code = 'Nr' WHERE target_id = 'melee-falco' AND sort_order = 0;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Re' WHERE target_id = 'melee-falco' AND sort_order = 1;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Bu' WHERE target_id = 'melee-falco' AND sort_order = 2;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Gr' WHERE target_id = 'melee-falco' AND sort_order = 3;--> statement-breakpoint
UPDATE targets SET file_code = 'Fx' WHERE id = 'melee-fox';--> statement-breakpoint
UPDATE target_slots SET file_code = 'Nr' WHERE target_id = 'melee-fox' AND sort_order = 0;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Or' WHERE target_id = 'melee-fox' AND sort_order = 1;--> statement-breakpoint
UPDATE target_slots SET file_code = 'La' WHERE target_id = 'melee-fox' AND sort_order = 2;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Gr' WHERE target_id = 'melee-fox' AND sort_order = 3;--> statement-breakpoint
UPDATE targets SET file_code = 'Ns' WHERE id = 'melee-ness';--> statement-breakpoint
UPDATE target_slots SET file_code = 'Nr' WHERE target_id = 'melee-ness' AND sort_order = 0;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Ye' WHERE target_id = 'melee-ness' AND sort_order = 1;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Bu' WHERE target_id = 'melee-ness' AND sort_order = 2;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Gr' WHERE target_id = 'melee-ness' AND sort_order = 3;--> statement-breakpoint
UPDATE targets SET file_code = 'Pp' WHERE id = 'melee-ice-climbers';--> statement-breakpoint
UPDATE target_slots SET file_code = 'Nr' WHERE target_id = 'melee-ice-climbers' AND sort_order = 0;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Gr' WHERE target_id = 'melee-ice-climbers' AND sort_order = 1;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Or' WHERE target_id = 'melee-ice-climbers' AND sort_order = 2;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Re' WHERE target_id = 'melee-ice-climbers' AND sort_order = 3;--> statement-breakpoint
UPDATE targets SET file_code = 'Kb' WHERE id = 'melee-kirby';--> statement-breakpoint
UPDATE target_slots SET file_code = 'Nr' WHERE target_id = 'melee-kirby' AND sort_order = 0;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Ye' WHERE target_id = 'melee-kirby' AND sort_order = 1;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Bu' WHERE target_id = 'melee-kirby' AND sort_order = 2;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Re' WHERE target_id = 'melee-kirby' AND sort_order = 3;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Gr' WHERE target_id = 'melee-kirby' AND sort_order = 4;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Wh' WHERE target_id = 'melee-kirby' AND sort_order = 5;--> statement-breakpoint
UPDATE targets SET file_code = 'Ss' WHERE id = 'melee-samus';--> statement-breakpoint
UPDATE target_slots SET file_code = 'Nr' WHERE target_id = 'melee-samus' AND sort_order = 0;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Pi' WHERE target_id = 'melee-samus' AND sort_order = 1;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Bk' WHERE target_id = 'melee-samus' AND sort_order = 2;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Gr' WHERE target_id = 'melee-samus' AND sort_order = 3;--> statement-breakpoint
UPDATE target_slots SET file_code = 'La' WHERE target_id = 'melee-samus' AND sort_order = 4;--> statement-breakpoint
UPDATE targets SET file_code = 'Zd' WHERE id = 'melee-zelda';--> statement-breakpoint
UPDATE target_slots SET file_code = 'Nr' WHERE target_id = 'melee-zelda' AND sort_order = 0;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Re' WHERE target_id = 'melee-zelda' AND sort_order = 1;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Bu' WHERE target_id = 'melee-zelda' AND sort_order = 2;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Gr' WHERE target_id = 'melee-zelda' AND sort_order = 3;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Wh' WHERE target_id = 'melee-zelda' AND sort_order = 4;--> statement-breakpoint
UPDATE targets SET file_code = 'Sk' WHERE id = 'melee-sheik';--> statement-breakpoint
UPDATE target_slots SET file_code = 'Nr' WHERE target_id = 'melee-sheik' AND sort_order = 0;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Re' WHERE target_id = 'melee-sheik' AND sort_order = 1;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Bu' WHERE target_id = 'melee-sheik' AND sort_order = 2;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Gr' WHERE target_id = 'melee-sheik' AND sort_order = 3;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Wh' WHERE target_id = 'melee-sheik' AND sort_order = 4;--> statement-breakpoint
UPDATE targets SET file_code = 'Lk' WHERE id = 'melee-link';--> statement-breakpoint
UPDATE target_slots SET file_code = 'Nr' WHERE target_id = 'melee-link' AND sort_order = 0;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Re' WHERE target_id = 'melee-link' AND sort_order = 1;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Bu' WHERE target_id = 'melee-link' AND sort_order = 2;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Bk' WHERE target_id = 'melee-link' AND sort_order = 3;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Wh' WHERE target_id = 'melee-link' AND sort_order = 4;--> statement-breakpoint
UPDATE targets SET file_code = 'Cl' WHERE id = 'melee-young-link';--> statement-breakpoint
UPDATE target_slots SET file_code = 'Nr' WHERE target_id = 'melee-young-link' AND sort_order = 0;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Re' WHERE target_id = 'melee-young-link' AND sort_order = 1;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Bu' WHERE target_id = 'melee-young-link' AND sort_order = 2;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Wh' WHERE target_id = 'melee-young-link' AND sort_order = 3;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Bk' WHERE target_id = 'melee-young-link' AND sort_order = 4;--> statement-breakpoint
UPDATE targets SET file_code = 'Pc' WHERE id = 'melee-pichu';--> statement-breakpoint
UPDATE target_slots SET file_code = 'Nr' WHERE target_id = 'melee-pichu' AND sort_order = 0;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Re' WHERE target_id = 'melee-pichu' AND sort_order = 1;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Bu' WHERE target_id = 'melee-pichu' AND sort_order = 2;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Gr' WHERE target_id = 'melee-pichu' AND sort_order = 3;--> statement-breakpoint
UPDATE targets SET file_code = 'Pk' WHERE id = 'melee-pikachu';--> statement-breakpoint
UPDATE target_slots SET file_code = 'Nr' WHERE target_id = 'melee-pikachu' AND sort_order = 0;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Re' WHERE target_id = 'melee-pikachu' AND sort_order = 1;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Bu' WHERE target_id = 'melee-pikachu' AND sort_order = 2;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Gr' WHERE target_id = 'melee-pikachu' AND sort_order = 3;--> statement-breakpoint
UPDATE targets SET file_code = 'Pr' WHERE id = 'melee-jigglypuff';--> statement-breakpoint
UPDATE target_slots SET file_code = 'Nr' WHERE target_id = 'melee-jigglypuff' AND sort_order = 0;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Re' WHERE target_id = 'melee-jigglypuff' AND sort_order = 1;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Bu' WHERE target_id = 'melee-jigglypuff' AND sort_order = 2;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Gr' WHERE target_id = 'melee-jigglypuff' AND sort_order = 3;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Ye' WHERE target_id = 'melee-jigglypuff' AND sort_order = 4;--> statement-breakpoint
UPDATE targets SET file_code = 'Mt' WHERE id = 'melee-mewtwo';--> statement-breakpoint
UPDATE target_slots SET file_code = 'Nr' WHERE target_id = 'melee-mewtwo' AND sort_order = 0;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Re' WHERE target_id = 'melee-mewtwo' AND sort_order = 1;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Bu' WHERE target_id = 'melee-mewtwo' AND sort_order = 2;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Gr' WHERE target_id = 'melee-mewtwo' AND sort_order = 3;--> statement-breakpoint
UPDATE targets SET file_code = 'Gw' WHERE id = 'melee-mr-game-and-watch';--> statement-breakpoint
UPDATE target_slots SET file_code = 'Nr' WHERE target_id = 'melee-mr-game-and-watch' AND sort_order = 0;--> statement-breakpoint
UPDATE targets SET file_code = 'Ms' WHERE id = 'melee-marth';--> statement-breakpoint
UPDATE target_slots SET file_code = 'Nr' WHERE target_id = 'melee-marth' AND sort_order = 0;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Re' WHERE target_id = 'melee-marth' AND sort_order = 1;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Gr' WHERE target_id = 'melee-marth' AND sort_order = 2;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Bk' WHERE target_id = 'melee-marth' AND sort_order = 3;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Wh' WHERE target_id = 'melee-marth' AND sort_order = 4;--> statement-breakpoint
UPDATE targets SET file_code = 'Fe' WHERE id = 'melee-roy';--> statement-breakpoint
UPDATE target_slots SET file_code = 'Nr' WHERE target_id = 'melee-roy' AND sort_order = 0;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Re' WHERE target_id = 'melee-roy' AND sort_order = 1;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Bu' WHERE target_id = 'melee-roy' AND sort_order = 2;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Gr' WHERE target_id = 'melee-roy' AND sort_order = 3;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Ye' WHERE target_id = 'melee-roy' AND sort_order = 4;--> statement-breakpoint
UPDATE targets SET file_code = 'Dr' WHERE id = 'melee-dr-mario';--> statement-breakpoint
UPDATE target_slots SET file_code = 'Nr' WHERE target_id = 'melee-dr-mario' AND sort_order = 0;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Re' WHERE target_id = 'melee-dr-mario' AND sort_order = 1;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Bu' WHERE target_id = 'melee-dr-mario' AND sort_order = 2;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Gr' WHERE target_id = 'melee-dr-mario' AND sort_order = 3;--> statement-breakpoint
UPDATE target_slots SET file_code = 'Bk' WHERE target_id = 'melee-dr-mario' AND sort_order = 4;
