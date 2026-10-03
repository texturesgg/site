-- The Super Smash Bros. Melee catalog: the game, its targets and their slots.
-- Every statement is INSERT OR IGNORE, so applying it again changes nothing.

-- Game
INSERT OR IGNORE INTO games (id, name, slug, short_name, platform, created_at, updated_at)
VALUES ('melee', 'Super Smash Bros. Melee', 'melee', 'Melee', 'GameCube', unixepoch() * 1000, unixepoch() * 1000);

-- Characters (targets, category: character)
INSERT OR IGNORE INTO targets (id, game_id, name, slug, category, sort_order) VALUES ('melee-fox', 'melee', 'Fox', 'fox', 'character', 1);
INSERT OR IGNORE INTO targets (id, game_id, name, slug, category, sort_order) VALUES ('melee-falco', 'melee', 'Falco', 'falco', 'character', 2);
INSERT OR IGNORE INTO targets (id, game_id, name, slug, category, sort_order) VALUES ('melee-marth', 'melee', 'Marth', 'marth', 'character', 3);
INSERT OR IGNORE INTO targets (id, game_id, name, slug, category, sort_order) VALUES ('melee-sheik', 'melee', 'Sheik', 'sheik', 'character', 4);
INSERT OR IGNORE INTO targets (id, game_id, name, slug, category, sort_order) VALUES ('melee-jigglypuff', 'melee', 'Jigglypuff', 'jigglypuff', 'character', 5);
INSERT OR IGNORE INTO targets (id, game_id, name, slug, category, sort_order) VALUES ('melee-peach', 'melee', 'Peach', 'peach', 'character', 6);
INSERT OR IGNORE INTO targets (id, game_id, name, slug, category, sort_order) VALUES ('melee-captain-falcon', 'melee', 'Captain Falcon', 'captain-falcon', 'character', 7);
INSERT OR IGNORE INTO targets (id, game_id, name, slug, category, sort_order) VALUES ('melee-ice-climbers', 'melee', 'Ice Climbers', 'ice-climbers', 'character', 8);
INSERT OR IGNORE INTO targets (id, game_id, name, slug, category, sort_order) VALUES ('melee-pikachu', 'melee', 'Pikachu', 'pikachu', 'character', 9);
INSERT OR IGNORE INTO targets (id, game_id, name, slug, category, sort_order) VALUES ('melee-samus', 'melee', 'Samus', 'samus', 'character', 10);
INSERT OR IGNORE INTO targets (id, game_id, name, slug, category, sort_order) VALUES ('melee-dr-mario', 'melee', 'Dr. Mario', 'dr-mario', 'character', 11);
INSERT OR IGNORE INTO targets (id, game_id, name, slug, category, sort_order) VALUES ('melee-yoshi', 'melee', 'Yoshi', 'yoshi', 'character', 12);
INSERT OR IGNORE INTO targets (id, game_id, name, slug, category, sort_order) VALUES ('melee-luigi', 'melee', 'Luigi', 'luigi', 'character', 13);
INSERT OR IGNORE INTO targets (id, game_id, name, slug, category, sort_order) VALUES ('melee-ganondorf', 'melee', 'Ganondorf', 'ganondorf', 'character', 14);
INSERT OR IGNORE INTO targets (id, game_id, name, slug, category, sort_order) VALUES ('melee-mario', 'melee', 'Mario', 'mario', 'character', 15);
INSERT OR IGNORE INTO targets (id, game_id, name, slug, category, sort_order) VALUES ('melee-young-link', 'melee', 'Young Link', 'young-link', 'character', 16);
INSERT OR IGNORE INTO targets (id, game_id, name, slug, category, sort_order) VALUES ('melee-donkey-kong', 'melee', 'Donkey Kong', 'donkey-kong', 'character', 17);
INSERT OR IGNORE INTO targets (id, game_id, name, slug, category, sort_order) VALUES ('melee-link', 'melee', 'Link', 'link', 'character', 18);
INSERT OR IGNORE INTO targets (id, game_id, name, slug, category, sort_order) VALUES ('melee-mr-game-and-watch', 'melee', 'Mr. Game & Watch', 'mr-game-and-watch', 'character', 19);
INSERT OR IGNORE INTO targets (id, game_id, name, slug, category, sort_order) VALUES ('melee-roy', 'melee', 'Roy', 'roy', 'character', 20);
INSERT OR IGNORE INTO targets (id, game_id, name, slug, category, sort_order) VALUES ('melee-mewtwo', 'melee', 'Mewtwo', 'mewtwo', 'character', 21);
INSERT OR IGNORE INTO targets (id, game_id, name, slug, category, sort_order) VALUES ('melee-zelda', 'melee', 'Zelda', 'zelda', 'character', 22);
INSERT OR IGNORE INTO targets (id, game_id, name, slug, category, sort_order) VALUES ('melee-ness', 'melee', 'Ness', 'ness', 'character', 23);
INSERT OR IGNORE INTO targets (id, game_id, name, slug, category, sort_order) VALUES ('melee-pichu', 'melee', 'Pichu', 'pichu', 'character', 24);
INSERT OR IGNORE INTO targets (id, game_id, name, slug, category, sort_order) VALUES ('melee-bowser', 'melee', 'Bowser', 'bowser', 'character', 25);
INSERT OR IGNORE INTO targets (id, game_id, name, slug, category, sort_order) VALUES ('melee-kirby', 'melee', 'Kirby', 'kirby', 'character', 26);

-- Stages (targets, category: stage)
INSERT OR IGNORE INTO targets (id, game_id, name, slug, category, sort_order) VALUES ('melee-battlefield', 'melee', 'Battlefield', 'battlefield', 'stage', 100);
INSERT OR IGNORE INTO targets (id, game_id, name, slug, category, sort_order) VALUES ('melee-final-destination', 'melee', 'Final Destination', 'final-destination', 'stage', 101);
INSERT OR IGNORE INTO targets (id, game_id, name, slug, category, sort_order) VALUES ('melee-yoshis-story', 'melee', 'Yoshi''s Story', 'yoshis-story', 'stage', 102);
INSERT OR IGNORE INTO targets (id, game_id, name, slug, category, sort_order) VALUES ('melee-fountain-of-dreams', 'melee', 'Fountain of Dreams', 'fountain-of-dreams', 'stage', 103);
INSERT OR IGNORE INTO targets (id, game_id, name, slug, category, sort_order) VALUES ('melee-pokemon-stadium', 'melee', 'Pokémon Stadium', 'pokemon-stadium', 'stage', 104);
INSERT OR IGNORE INTO targets (id, game_id, name, slug, category, sort_order) VALUES ('melee-dreamland', 'melee', 'Dream Land N64', 'dreamland', 'stage', 105);
INSERT OR IGNORE INTO targets (id, game_id, name, slug, category, sort_order) VALUES ('melee-hyrule-temple', 'melee', 'Hyrule Temple', 'hyrule-temple', 'stage', 110);
INSERT OR IGNORE INTO targets (id, game_id, name, slug, category, sort_order) VALUES ('melee-green-greens', 'melee', 'Green Greens', 'green-greens', 'stage', 111);
INSERT OR IGNORE INTO targets (id, game_id, name, slug, category, sort_order) VALUES ('melee-corneria', 'melee', 'Corneria', 'corneria', 'stage', 112);
INSERT OR IGNORE INTO targets (id, game_id, name, slug, category, sort_order) VALUES ('melee-brinstar', 'melee', 'Brinstar', 'brinstar', 'stage', 113);
INSERT OR IGNORE INTO targets (id, game_id, name, slug, category, sort_order) VALUES ('melee-brinstar-depths', 'melee', 'Brinstar Depths', 'brinstar-depths', 'stage', 114);
INSERT OR IGNORE INTO targets (id, game_id, name, slug, category, sort_order) VALUES ('melee-onett', 'melee', 'Onett', 'onett', 'stage', 115);
INSERT OR IGNORE INTO targets (id, game_id, name, slug, category, sort_order) VALUES ('melee-fourside', 'melee', 'Fourside', 'fourside', 'stage', 116);
INSERT OR IGNORE INTO targets (id, game_id, name, slug, category, sort_order) VALUES ('melee-rainbow-cruise', 'melee', 'Rainbow Cruise', 'rainbow-cruise', 'stage', 117);
INSERT OR IGNORE INTO targets (id, game_id, name, slug, category, sort_order) VALUES ('melee-kongo-jungle', 'melee', 'Kongo Jungle', 'kongo-jungle', 'stage', 118);
INSERT OR IGNORE INTO targets (id, game_id, name, slug, category, sort_order) VALUES ('melee-kongo-jungle-n64', 'melee', 'Kongo Jungle N64', 'kongo-jungle-n64', 'stage', 119);
INSERT OR IGNORE INTO targets (id, game_id, name, slug, category, sort_order) VALUES ('melee-jungle-japes', 'melee', 'Jungle Japes', 'jungle-japes', 'stage', 120);
INSERT OR IGNORE INTO targets (id, game_id, name, slug, category, sort_order) VALUES ('melee-great-bay', 'melee', 'Great Bay', 'great-bay', 'stage', 121);
INSERT OR IGNORE INTO targets (id, game_id, name, slug, category, sort_order) VALUES ('melee-poke-floats', 'melee', 'Poké Floats', 'poke-floats', 'stage', 122);
INSERT OR IGNORE INTO targets (id, game_id, name, slug, category, sort_order) VALUES ('melee-mushroom-kingdom', 'melee', 'Mushroom Kingdom', 'mushroom-kingdom', 'stage', 123);
INSERT OR IGNORE INTO targets (id, game_id, name, slug, category, sort_order) VALUES ('melee-mushroom-kingdom-ii', 'melee', 'Mushroom Kingdom II', 'mushroom-kingdom-ii', 'stage', 124);
INSERT OR IGNORE INTO targets (id, game_id, name, slug, category, sort_order) VALUES ('melee-mute-city', 'melee', 'Mute City', 'mute-city', 'stage', 125);
INSERT OR IGNORE INTO targets (id, game_id, name, slug, category, sort_order) VALUES ('melee-big-blue', 'melee', 'Big Blue', 'big-blue', 'stage', 126);
INSERT OR IGNORE INTO targets (id, game_id, name, slug, category, sort_order) VALUES ('melee-princess-peachs-castle', 'melee', 'Princess Peach''s Castle', 'princess-peachs-castle', 'stage', 127);
INSERT OR IGNORE INTO targets (id, game_id, name, slug, category, sort_order) VALUES ('melee-yoshis-island-n64', 'melee', 'Yoshi''s Island N64', 'yoshis-island-n64', 'stage', 128);
INSERT OR IGNORE INTO targets (id, game_id, name, slug, category, sort_order) VALUES ('melee-flat-zone', 'melee', 'Flat Zone', 'flat-zone', 'stage', 129);
INSERT OR IGNORE INTO targets (id, game_id, name, slug, category, sort_order) VALUES ('melee-icicle-mountain', 'melee', 'Icicle Mountain', 'icicle-mountain', 'stage', 130);
INSERT OR IGNORE INTO targets (id, game_id, name, slug, category, sort_order) VALUES ('melee-venom', 'melee', 'Venom', 'venom', 'stage', 131);
INSERT OR IGNORE INTO targets (id, game_id, name, slug, category, sort_order) VALUES ('melee-volleyball', 'melee', 'Volleyball', 'volleyball', 'stage', 140);
INSERT OR IGNORE INTO targets (id, game_id, name, slug, category, sort_order) VALUES ('melee-other-stages', 'melee', 'Other', 'other-stages', 'stage', 199);

-- Other targets (UI, audio, etc.)
INSERT OR IGNORE INTO targets (id, game_id, name, slug, category, sort_order) VALUES ('melee-csp', 'melee', 'Character Select Portraits', 'csp', 'ui', 200);
INSERT OR IGNORE INTO targets (id, game_id, name, slug, category, sort_order) VALUES ('melee-css', 'melee', 'Character Select Screen', 'css', 'ui', 201);
INSERT OR IGNORE INTO targets (id, game_id, name, slug, category, sort_order) VALUES ('melee-sss', 'melee', 'Stage Select Screen', 'sss', 'ui', 202);
INSERT OR IGNORE INTO targets (id, game_id, name, slug, category, sort_order) VALUES ('melee-pause-screens', 'melee', 'Pause Screens', 'pause-screens', 'ui', 203);
INSERT OR IGNORE INTO targets (id, game_id, name, slug, category, sort_order) VALUES ('melee-trophies', 'melee', 'Trophies', 'trophies', 'ui', 204);
INSERT OR IGNORE INTO targets (id, game_id, name, slug, category, sort_order) VALUES ('melee-fonts', 'melee', 'Typeface/Fonts', 'fonts', 'ui', 205);
INSERT OR IGNORE INTO targets (id, game_id, name, slug, category, sort_order) VALUES ('melee-assets', 'melee', 'Assets', 'assets', 'ui', 206);
INSERT OR IGNORE INTO targets (id, game_id, name, slug, category, sort_order) VALUES ('melee-audio', 'melee', 'Audio', 'audio', 'audio', 210);
INSERT OR IGNORE INTO targets (id, game_id, name, slug, category, sort_order) VALUES ('melee-balance-patches', 'melee', 'Balance Patches', 'balance-patches', 'ui', 220);
INSERT OR IGNORE INTO targets (id, game_id, name, slug, category, sort_order) VALUES ('melee-texture-packs', 'melee', 'Texture Packs', 'texture-packs', 'ui', 221);

-- Character slots (target_slots)
-- Mario
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-mario-slot-neutral', 'melee-mario', 'Neutral', 0);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-mario-slot-yellow', 'melee-mario', 'Yellow', 1);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-mario-slot-black', 'melee-mario', 'Black', 2);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-mario-slot-blue', 'melee-mario', 'Blue', 3);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-mario-slot-green', 'melee-mario', 'Green', 4);

-- Luigi
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-luigi-slot-neutral', 'melee-luigi', 'Neutral', 0);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-luigi-slot-white', 'melee-luigi', 'White', 1);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-luigi-slot-blue', 'melee-luigi', 'Blue', 2);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-luigi-slot-pink', 'melee-luigi', 'Pink', 3);

-- Bowser
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-bowser-slot-neutral', 'melee-bowser', 'Neutral', 0);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-bowser-slot-red', 'melee-bowser', 'Red', 1);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-bowser-slot-blue', 'melee-bowser', 'Blue', 2);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-bowser-slot-black', 'melee-bowser', 'Black', 3);

-- Peach
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-peach-slot-neutral', 'melee-peach', 'Neutral', 0);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-peach-slot-daisy', 'melee-peach', 'Daisy', 1);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-peach-slot-white', 'melee-peach', 'White', 2);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-peach-slot-blue', 'melee-peach', 'Blue', 3);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-peach-slot-green', 'melee-peach', 'Green', 4);

-- Yoshi
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-yoshi-slot-neutral', 'melee-yoshi', 'Neutral', 0);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-yoshi-slot-red', 'melee-yoshi', 'Red', 1);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-yoshi-slot-blue', 'melee-yoshi', 'Blue', 2);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-yoshi-slot-yellow', 'melee-yoshi', 'Yellow', 3);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-yoshi-slot-pink', 'melee-yoshi', 'Pink', 4);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-yoshi-slot-cyan', 'melee-yoshi', 'Cyan', 5);

-- Donkey Kong
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-donkey-kong-slot-neutral', 'melee-donkey-kong', 'Neutral', 0);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-donkey-kong-slot-black', 'melee-donkey-kong', 'Black', 1);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-donkey-kong-slot-red', 'melee-donkey-kong', 'Red', 2);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-donkey-kong-slot-blue', 'melee-donkey-kong', 'Blue', 3);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-donkey-kong-slot-green', 'melee-donkey-kong', 'Green', 4);

-- Captain Falcon
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-captain-falcon-slot-neutral', 'melee-captain-falcon', 'Neutral', 0);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-captain-falcon-slot-black', 'melee-captain-falcon', 'Black', 1);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-captain-falcon-slot-red', 'melee-captain-falcon', 'Red', 2);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-captain-falcon-slot-white', 'melee-captain-falcon', 'White', 3);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-captain-falcon-slot-green', 'melee-captain-falcon', 'Green', 4);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-captain-falcon-slot-blue', 'melee-captain-falcon', 'Blue', 5);

-- Ganondorf
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-ganondorf-slot-neutral', 'melee-ganondorf', 'Neutral', 0);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-ganondorf-slot-red', 'melee-ganondorf', 'Red', 1);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-ganondorf-slot-blue', 'melee-ganondorf', 'Blue', 2);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-ganondorf-slot-green', 'melee-ganondorf', 'Green', 3);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-ganondorf-slot-lavender', 'melee-ganondorf', 'Lavender', 4);

-- Falco
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-falco-slot-neutral', 'melee-falco', 'Neutral', 0);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-falco-slot-red', 'melee-falco', 'Red', 1);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-falco-slot-blue', 'melee-falco', 'Blue', 2);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-falco-slot-green', 'melee-falco', 'Green', 3);

-- Fox
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-fox-slot-neutral', 'melee-fox', 'Neutral', 0);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-fox-slot-orange', 'melee-fox', 'Orange', 1);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-fox-slot-blue', 'melee-fox', 'Blue', 2);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-fox-slot-green', 'melee-fox', 'Green', 3);

-- Ness
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-ness-slot-neutral', 'melee-ness', 'Neutral', 0);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-ness-slot-yellow', 'melee-ness', 'Yellow', 1);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-ness-slot-blue', 'melee-ness', 'Blue', 2);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-ness-slot-green', 'melee-ness', 'Green', 3);

-- Ice Climbers
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-ice-climbers-slot-neutral', 'melee-ice-climbers', 'Neutral', 0);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-ice-climbers-slot-green', 'melee-ice-climbers', 'Green', 1);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-ice-climbers-slot-orange', 'melee-ice-climbers', 'Orange', 2);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-ice-climbers-slot-red', 'melee-ice-climbers', 'Red', 3);

-- Kirby
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-kirby-slot-neutral', 'melee-kirby', 'Neutral', 0);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-kirby-slot-yellow', 'melee-kirby', 'Yellow', 1);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-kirby-slot-blue', 'melee-kirby', 'Blue', 2);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-kirby-slot-red', 'melee-kirby', 'Red', 3);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-kirby-slot-green', 'melee-kirby', 'Green', 4);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-kirby-slot-white', 'melee-kirby', 'White', 5);

-- Samus
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-samus-slot-neutral', 'melee-samus', 'Neutral', 0);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-samus-slot-pink', 'melee-samus', 'Pink', 1);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-samus-slot-black', 'melee-samus', 'Black', 2);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-samus-slot-green', 'melee-samus', 'Green', 3);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-samus-slot-blue', 'melee-samus', 'Blue', 4);

-- Zelda
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-zelda-slot-neutral', 'melee-zelda', 'Neutral', 0);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-zelda-slot-red', 'melee-zelda', 'Red', 1);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-zelda-slot-blue', 'melee-zelda', 'Blue', 2);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-zelda-slot-green', 'melee-zelda', 'Green', 3);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-zelda-slot-white', 'melee-zelda', 'White', 4);

-- Sheik
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-sheik-slot-neutral', 'melee-sheik', 'Neutral', 0);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-sheik-slot-red', 'melee-sheik', 'Red', 1);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-sheik-slot-blue', 'melee-sheik', 'Blue', 2);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-sheik-slot-green', 'melee-sheik', 'Green', 3);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-sheik-slot-white', 'melee-sheik', 'White', 4);

-- Link
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-link-slot-neutral', 'melee-link', 'Neutral', 0);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-link-slot-red', 'melee-link', 'Red', 1);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-link-slot-blue', 'melee-link', 'Blue', 2);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-link-slot-black', 'melee-link', 'Black', 3);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-link-slot-white', 'melee-link', 'White', 4);

-- Young Link
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-young-link-slot-neutral', 'melee-young-link', 'Neutral', 0);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-young-link-slot-red', 'melee-young-link', 'Red', 1);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-young-link-slot-blue', 'melee-young-link', 'Blue', 2);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-young-link-slot-white', 'melee-young-link', 'White', 3);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-young-link-slot-black', 'melee-young-link', 'Black', 4);

-- Pichu
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-pichu-slot-neutral', 'melee-pichu', 'Neutral', 0);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-pichu-slot-red', 'melee-pichu', 'Red', 1);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-pichu-slot-blue', 'melee-pichu', 'Blue', 2);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-pichu-slot-green', 'melee-pichu', 'Green', 3);

-- Pikachu
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-pikachu-slot-neutral', 'melee-pikachu', 'Neutral', 0);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-pikachu-slot-red', 'melee-pikachu', 'Red', 1);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-pikachu-slot-blue', 'melee-pikachu', 'Blue', 2);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-pikachu-slot-green', 'melee-pikachu', 'Green', 3);

-- Jigglypuff
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-jigglypuff-slot-neutral', 'melee-jigglypuff', 'Neutral', 0);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-jigglypuff-slot-red', 'melee-jigglypuff', 'Red', 1);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-jigglypuff-slot-blue', 'melee-jigglypuff', 'Blue', 2);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-jigglypuff-slot-green', 'melee-jigglypuff', 'Green', 3);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-jigglypuff-slot-crown', 'melee-jigglypuff', 'Crown', 4);

-- Mewtwo
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-mewtwo-slot-neutral', 'melee-mewtwo', 'Neutral', 0);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-mewtwo-slot-red', 'melee-mewtwo', 'Red', 1);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-mewtwo-slot-blue', 'melee-mewtwo', 'Blue', 2);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-mewtwo-slot-green', 'melee-mewtwo', 'Green', 3);

-- Mr. Game & Watch
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-mr-game-and-watch-slot-neutral', 'melee-mr-game-and-watch', 'Neutral', 0);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-mr-game-and-watch-slot-red', 'melee-mr-game-and-watch', 'Red', 1);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-mr-game-and-watch-slot-blue', 'melee-mr-game-and-watch', 'Blue', 2);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-mr-game-and-watch-slot-green', 'melee-mr-game-and-watch', 'Green', 3);

-- Marth
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-marth-slot-neutral', 'melee-marth', 'Neutral', 0);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-marth-slot-red', 'melee-marth', 'Red', 1);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-marth-slot-green', 'melee-marth', 'Green', 2);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-marth-slot-black', 'melee-marth', 'Black', 3);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-marth-slot-white', 'melee-marth', 'White', 4);

-- Roy
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-roy-slot-neutral', 'melee-roy', 'Neutral', 0);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-roy-slot-red', 'melee-roy', 'Red', 1);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-roy-slot-blue', 'melee-roy', 'Blue', 2);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-roy-slot-green', 'melee-roy', 'Green', 3);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-roy-slot-yellow', 'melee-roy', 'Yellow', 4);

-- Dr. Mario
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-dr-mario-slot-neutral', 'melee-dr-mario', 'Neutral', 0);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-dr-mario-slot-red', 'melee-dr-mario', 'Red', 1);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-dr-mario-slot-blue', 'melee-dr-mario', 'Blue', 2);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-dr-mario-slot-green', 'melee-dr-mario', 'Green', 3);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-dr-mario-slot-black', 'melee-dr-mario', 'Black', 4);

-- Stage slots (each stage gets a single "Default" slot)
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-battlefield-slot-default', 'melee-battlefield', 'Default', 0);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-final-destination-slot-default', 'melee-final-destination', 'Default', 0);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-yoshis-story-slot-default', 'melee-yoshis-story', 'Default', 0);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-fountain-of-dreams-slot-default', 'melee-fountain-of-dreams', 'Default', 0);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-pokemon-stadium-slot-default', 'melee-pokemon-stadium', 'Default', 0);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-dreamland-slot-default', 'melee-dreamland', 'Default', 0);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-hyrule-temple-slot-default', 'melee-hyrule-temple', 'Default', 0);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-green-greens-slot-default', 'melee-green-greens', 'Default', 0);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-corneria-slot-default', 'melee-corneria', 'Default', 0);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-brinstar-slot-default', 'melee-brinstar', 'Default', 0);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-brinstar-depths-slot-default', 'melee-brinstar-depths', 'Default', 0);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-onett-slot-default', 'melee-onett', 'Default', 0);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-fourside-slot-default', 'melee-fourside', 'Default', 0);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-rainbow-cruise-slot-default', 'melee-rainbow-cruise', 'Default', 0);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-kongo-jungle-slot-default', 'melee-kongo-jungle', 'Default', 0);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-kongo-jungle-n64-slot-default', 'melee-kongo-jungle-n64', 'Default', 0);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-jungle-japes-slot-default', 'melee-jungle-japes', 'Default', 0);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-great-bay-slot-default', 'melee-great-bay', 'Default', 0);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-poke-floats-slot-default', 'melee-poke-floats', 'Default', 0);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-mushroom-kingdom-slot-default', 'melee-mushroom-kingdom', 'Default', 0);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-mushroom-kingdom-ii-slot-default', 'melee-mushroom-kingdom-ii', 'Default', 0);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-mute-city-slot-default', 'melee-mute-city', 'Default', 0);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-big-blue-slot-default', 'melee-big-blue', 'Default', 0);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-princess-peachs-castle-slot-default', 'melee-princess-peachs-castle', 'Default', 0);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-yoshis-island-n64-slot-default', 'melee-yoshis-island-n64', 'Default', 0);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-flat-zone-slot-default', 'melee-flat-zone', 'Default', 0);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-icicle-mountain-slot-default', 'melee-icicle-mountain', 'Default', 0);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-venom-slot-default', 'melee-venom', 'Default', 0);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-volleyball-slot-default', 'melee-volleyball', 'Default', 0);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-other-stages-slot-default', 'melee-other-stages', 'Default', 0);

-- Other target slots (each gets a single "Default" slot)
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-csp-slot-default', 'melee-csp', 'Default', 0);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-css-slot-default', 'melee-css', 'Default', 0);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-sss-slot-default', 'melee-sss', 'Default', 0);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-pause-screens-slot-default', 'melee-pause-screens', 'Default', 0);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-trophies-slot-default', 'melee-trophies', 'Default', 0);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-fonts-slot-default', 'melee-fonts', 'Default', 0);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-assets-slot-default', 'melee-assets', 'Default', 0);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-audio-slot-default', 'melee-audio', 'Default', 0);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-balance-patches-slot-default', 'melee-balance-patches', 'Default', 0);
INSERT OR IGNORE INTO target_slots (id, target_id, name, sort_order) VALUES ('melee-texture-packs-slot-default', 'melee-texture-packs', 'Default', 0);

-- Melee file codes (kept in sync with migrations/0010_costume_file_codes.sql)
UPDATE targets SET file_code = 'Mr' WHERE id = 'melee-mario';
UPDATE target_slots SET file_code = 'Nr' WHERE target_id = 'melee-mario' AND sort_order = 0;
UPDATE target_slots SET file_code = 'Ye' WHERE target_id = 'melee-mario' AND sort_order = 1;
UPDATE target_slots SET file_code = 'Bk' WHERE target_id = 'melee-mario' AND sort_order = 2;
UPDATE target_slots SET file_code = 'Bu' WHERE target_id = 'melee-mario' AND sort_order = 3;
UPDATE target_slots SET file_code = 'Gr' WHERE target_id = 'melee-mario' AND sort_order = 4;
UPDATE targets SET file_code = 'Lg' WHERE id = 'melee-luigi';
UPDATE target_slots SET file_code = 'Nr' WHERE target_id = 'melee-luigi' AND sort_order = 0;
UPDATE target_slots SET file_code = 'Wh' WHERE target_id = 'melee-luigi' AND sort_order = 1;
UPDATE target_slots SET file_code = 'Aq' WHERE target_id = 'melee-luigi' AND sort_order = 2;
UPDATE target_slots SET file_code = 'Pi' WHERE target_id = 'melee-luigi' AND sort_order = 3;
UPDATE targets SET file_code = 'Kp' WHERE id = 'melee-bowser';
UPDATE target_slots SET file_code = 'Nr' WHERE target_id = 'melee-bowser' AND sort_order = 0;
UPDATE target_slots SET file_code = 'Re' WHERE target_id = 'melee-bowser' AND sort_order = 1;
UPDATE target_slots SET file_code = 'Bu' WHERE target_id = 'melee-bowser' AND sort_order = 2;
UPDATE target_slots SET file_code = 'Bk' WHERE target_id = 'melee-bowser' AND sort_order = 3;
UPDATE targets SET file_code = 'Pe' WHERE id = 'melee-peach';
UPDATE target_slots SET file_code = 'Nr' WHERE target_id = 'melee-peach' AND sort_order = 0;
UPDATE target_slots SET file_code = 'Ye' WHERE target_id = 'melee-peach' AND sort_order = 1;
UPDATE target_slots SET file_code = 'Wh' WHERE target_id = 'melee-peach' AND sort_order = 2;
UPDATE target_slots SET file_code = 'Bu' WHERE target_id = 'melee-peach' AND sort_order = 3;
UPDATE target_slots SET file_code = 'Gr' WHERE target_id = 'melee-peach' AND sort_order = 4;
UPDATE targets SET file_code = 'Ys' WHERE id = 'melee-yoshi';
UPDATE target_slots SET file_code = 'Nr' WHERE target_id = 'melee-yoshi' AND sort_order = 0;
UPDATE target_slots SET file_code = 'Re' WHERE target_id = 'melee-yoshi' AND sort_order = 1;
UPDATE target_slots SET file_code = 'Bu' WHERE target_id = 'melee-yoshi' AND sort_order = 2;
UPDATE target_slots SET file_code = 'Ye' WHERE target_id = 'melee-yoshi' AND sort_order = 3;
UPDATE target_slots SET file_code = 'Pi' WHERE target_id = 'melee-yoshi' AND sort_order = 4;
UPDATE target_slots SET file_code = 'Aq' WHERE target_id = 'melee-yoshi' AND sort_order = 5;
UPDATE targets SET file_code = 'Dk' WHERE id = 'melee-donkey-kong';
UPDATE target_slots SET file_code = 'Nr' WHERE target_id = 'melee-donkey-kong' AND sort_order = 0;
UPDATE target_slots SET file_code = 'Bk' WHERE target_id = 'melee-donkey-kong' AND sort_order = 1;
UPDATE target_slots SET file_code = 'Re' WHERE target_id = 'melee-donkey-kong' AND sort_order = 2;
UPDATE target_slots SET file_code = 'Bu' WHERE target_id = 'melee-donkey-kong' AND sort_order = 3;
UPDATE target_slots SET file_code = 'Gr' WHERE target_id = 'melee-donkey-kong' AND sort_order = 4;
UPDATE targets SET file_code = 'Ca' WHERE id = 'melee-captain-falcon';
UPDATE target_slots SET file_code = 'Nr' WHERE target_id = 'melee-captain-falcon' AND sort_order = 0;
UPDATE target_slots SET file_code = 'Gy' WHERE target_id = 'melee-captain-falcon' AND sort_order = 1;
UPDATE target_slots SET file_code = 'Re' WHERE target_id = 'melee-captain-falcon' AND sort_order = 2;
UPDATE target_slots SET file_code = 'Wh' WHERE target_id = 'melee-captain-falcon' AND sort_order = 3;
UPDATE target_slots SET file_code = 'Gr' WHERE target_id = 'melee-captain-falcon' AND sort_order = 4;
UPDATE target_slots SET file_code = 'Bu' WHERE target_id = 'melee-captain-falcon' AND sort_order = 5;
UPDATE targets SET file_code = 'Gn' WHERE id = 'melee-ganondorf';
UPDATE target_slots SET file_code = 'Nr' WHERE target_id = 'melee-ganondorf' AND sort_order = 0;
UPDATE target_slots SET file_code = 'Re' WHERE target_id = 'melee-ganondorf' AND sort_order = 1;
UPDATE target_slots SET file_code = 'Bu' WHERE target_id = 'melee-ganondorf' AND sort_order = 2;
UPDATE target_slots SET file_code = 'Gr' WHERE target_id = 'melee-ganondorf' AND sort_order = 3;
UPDATE target_slots SET file_code = 'La' WHERE target_id = 'melee-ganondorf' AND sort_order = 4;
UPDATE targets SET file_code = 'Fc' WHERE id = 'melee-falco';
UPDATE target_slots SET file_code = 'Nr' WHERE target_id = 'melee-falco' AND sort_order = 0;
UPDATE target_slots SET file_code = 'Re' WHERE target_id = 'melee-falco' AND sort_order = 1;
UPDATE target_slots SET file_code = 'Bu' WHERE target_id = 'melee-falco' AND sort_order = 2;
UPDATE target_slots SET file_code = 'Gr' WHERE target_id = 'melee-falco' AND sort_order = 3;
UPDATE targets SET file_code = 'Fx' WHERE id = 'melee-fox';
UPDATE target_slots SET file_code = 'Nr' WHERE target_id = 'melee-fox' AND sort_order = 0;
UPDATE target_slots SET file_code = 'Or' WHERE target_id = 'melee-fox' AND sort_order = 1;
UPDATE target_slots SET file_code = 'La' WHERE target_id = 'melee-fox' AND sort_order = 2;
UPDATE target_slots SET file_code = 'Gr' WHERE target_id = 'melee-fox' AND sort_order = 3;
UPDATE targets SET file_code = 'Ns' WHERE id = 'melee-ness';
UPDATE target_slots SET file_code = 'Nr' WHERE target_id = 'melee-ness' AND sort_order = 0;
UPDATE target_slots SET file_code = 'Ye' WHERE target_id = 'melee-ness' AND sort_order = 1;
UPDATE target_slots SET file_code = 'Bu' WHERE target_id = 'melee-ness' AND sort_order = 2;
UPDATE target_slots SET file_code = 'Gr' WHERE target_id = 'melee-ness' AND sort_order = 3;
UPDATE targets SET file_code = 'Pp' WHERE id = 'melee-ice-climbers';
UPDATE target_slots SET file_code = 'Nr' WHERE target_id = 'melee-ice-climbers' AND sort_order = 0;
UPDATE target_slots SET file_code = 'Gr' WHERE target_id = 'melee-ice-climbers' AND sort_order = 1;
UPDATE target_slots SET file_code = 'Or' WHERE target_id = 'melee-ice-climbers' AND sort_order = 2;
UPDATE target_slots SET file_code = 'Re' WHERE target_id = 'melee-ice-climbers' AND sort_order = 3;
UPDATE targets SET file_code = 'Kb' WHERE id = 'melee-kirby';
UPDATE target_slots SET file_code = 'Nr' WHERE target_id = 'melee-kirby' AND sort_order = 0;
UPDATE target_slots SET file_code = 'Ye' WHERE target_id = 'melee-kirby' AND sort_order = 1;
UPDATE target_slots SET file_code = 'Bu' WHERE target_id = 'melee-kirby' AND sort_order = 2;
UPDATE target_slots SET file_code = 'Re' WHERE target_id = 'melee-kirby' AND sort_order = 3;
UPDATE target_slots SET file_code = 'Gr' WHERE target_id = 'melee-kirby' AND sort_order = 4;
UPDATE target_slots SET file_code = 'Wh' WHERE target_id = 'melee-kirby' AND sort_order = 5;
UPDATE targets SET file_code = 'Ss' WHERE id = 'melee-samus';
UPDATE target_slots SET file_code = 'Nr' WHERE target_id = 'melee-samus' AND sort_order = 0;
UPDATE target_slots SET file_code = 'Pi' WHERE target_id = 'melee-samus' AND sort_order = 1;
UPDATE target_slots SET file_code = 'Bk' WHERE target_id = 'melee-samus' AND sort_order = 2;
UPDATE target_slots SET file_code = 'Gr' WHERE target_id = 'melee-samus' AND sort_order = 3;
UPDATE target_slots SET file_code = 'La' WHERE target_id = 'melee-samus' AND sort_order = 4;
UPDATE targets SET file_code = 'Zd' WHERE id = 'melee-zelda';
UPDATE target_slots SET file_code = 'Nr' WHERE target_id = 'melee-zelda' AND sort_order = 0;
UPDATE target_slots SET file_code = 'Re' WHERE target_id = 'melee-zelda' AND sort_order = 1;
UPDATE target_slots SET file_code = 'Bu' WHERE target_id = 'melee-zelda' AND sort_order = 2;
UPDATE target_slots SET file_code = 'Gr' WHERE target_id = 'melee-zelda' AND sort_order = 3;
UPDATE target_slots SET file_code = 'Wh' WHERE target_id = 'melee-zelda' AND sort_order = 4;
UPDATE targets SET file_code = 'Sk' WHERE id = 'melee-sheik';
UPDATE target_slots SET file_code = 'Nr' WHERE target_id = 'melee-sheik' AND sort_order = 0;
UPDATE target_slots SET file_code = 'Re' WHERE target_id = 'melee-sheik' AND sort_order = 1;
UPDATE target_slots SET file_code = 'Bu' WHERE target_id = 'melee-sheik' AND sort_order = 2;
UPDATE target_slots SET file_code = 'Gr' WHERE target_id = 'melee-sheik' AND sort_order = 3;
UPDATE target_slots SET file_code = 'Wh' WHERE target_id = 'melee-sheik' AND sort_order = 4;
UPDATE targets SET file_code = 'Lk' WHERE id = 'melee-link';
UPDATE target_slots SET file_code = 'Nr' WHERE target_id = 'melee-link' AND sort_order = 0;
UPDATE target_slots SET file_code = 'Re' WHERE target_id = 'melee-link' AND sort_order = 1;
UPDATE target_slots SET file_code = 'Bu' WHERE target_id = 'melee-link' AND sort_order = 2;
UPDATE target_slots SET file_code = 'Bk' WHERE target_id = 'melee-link' AND sort_order = 3;
UPDATE target_slots SET file_code = 'Wh' WHERE target_id = 'melee-link' AND sort_order = 4;
UPDATE targets SET file_code = 'Cl' WHERE id = 'melee-young-link';
UPDATE target_slots SET file_code = 'Nr' WHERE target_id = 'melee-young-link' AND sort_order = 0;
UPDATE target_slots SET file_code = 'Re' WHERE target_id = 'melee-young-link' AND sort_order = 1;
UPDATE target_slots SET file_code = 'Bu' WHERE target_id = 'melee-young-link' AND sort_order = 2;
UPDATE target_slots SET file_code = 'Wh' WHERE target_id = 'melee-young-link' AND sort_order = 3;
UPDATE target_slots SET file_code = 'Bk' WHERE target_id = 'melee-young-link' AND sort_order = 4;
UPDATE targets SET file_code = 'Pc' WHERE id = 'melee-pichu';
UPDATE target_slots SET file_code = 'Nr' WHERE target_id = 'melee-pichu' AND sort_order = 0;
UPDATE target_slots SET file_code = 'Re' WHERE target_id = 'melee-pichu' AND sort_order = 1;
UPDATE target_slots SET file_code = 'Bu' WHERE target_id = 'melee-pichu' AND sort_order = 2;
UPDATE target_slots SET file_code = 'Gr' WHERE target_id = 'melee-pichu' AND sort_order = 3;
UPDATE targets SET file_code = 'Pk' WHERE id = 'melee-pikachu';
UPDATE target_slots SET file_code = 'Nr' WHERE target_id = 'melee-pikachu' AND sort_order = 0;
UPDATE target_slots SET file_code = 'Re' WHERE target_id = 'melee-pikachu' AND sort_order = 1;
UPDATE target_slots SET file_code = 'Bu' WHERE target_id = 'melee-pikachu' AND sort_order = 2;
UPDATE target_slots SET file_code = 'Gr' WHERE target_id = 'melee-pikachu' AND sort_order = 3;
UPDATE targets SET file_code = 'Pr' WHERE id = 'melee-jigglypuff';
UPDATE target_slots SET file_code = 'Nr' WHERE target_id = 'melee-jigglypuff' AND sort_order = 0;
UPDATE target_slots SET file_code = 'Re' WHERE target_id = 'melee-jigglypuff' AND sort_order = 1;
UPDATE target_slots SET file_code = 'Bu' WHERE target_id = 'melee-jigglypuff' AND sort_order = 2;
UPDATE target_slots SET file_code = 'Gr' WHERE target_id = 'melee-jigglypuff' AND sort_order = 3;
UPDATE target_slots SET file_code = 'Ye' WHERE target_id = 'melee-jigglypuff' AND sort_order = 4;
UPDATE targets SET file_code = 'Mt' WHERE id = 'melee-mewtwo';
UPDATE target_slots SET file_code = 'Nr' WHERE target_id = 'melee-mewtwo' AND sort_order = 0;
UPDATE target_slots SET file_code = 'Re' WHERE target_id = 'melee-mewtwo' AND sort_order = 1;
UPDATE target_slots SET file_code = 'Bu' WHERE target_id = 'melee-mewtwo' AND sort_order = 2;
UPDATE target_slots SET file_code = 'Gr' WHERE target_id = 'melee-mewtwo' AND sort_order = 3;
UPDATE targets SET file_code = 'Gw' WHERE id = 'melee-mr-game-and-watch';
UPDATE target_slots SET file_code = 'Nr' WHERE target_id = 'melee-mr-game-and-watch' AND sort_order = 0;
UPDATE targets SET file_code = 'Ms' WHERE id = 'melee-marth';
UPDATE target_slots SET file_code = 'Nr' WHERE target_id = 'melee-marth' AND sort_order = 0;
UPDATE target_slots SET file_code = 'Re' WHERE target_id = 'melee-marth' AND sort_order = 1;
UPDATE target_slots SET file_code = 'Gr' WHERE target_id = 'melee-marth' AND sort_order = 2;
UPDATE target_slots SET file_code = 'Bk' WHERE target_id = 'melee-marth' AND sort_order = 3;
UPDATE target_slots SET file_code = 'Wh' WHERE target_id = 'melee-marth' AND sort_order = 4;
UPDATE targets SET file_code = 'Fe' WHERE id = 'melee-roy';
UPDATE target_slots SET file_code = 'Nr' WHERE target_id = 'melee-roy' AND sort_order = 0;
UPDATE target_slots SET file_code = 'Re' WHERE target_id = 'melee-roy' AND sort_order = 1;
UPDATE target_slots SET file_code = 'Bu' WHERE target_id = 'melee-roy' AND sort_order = 2;
UPDATE target_slots SET file_code = 'Gr' WHERE target_id = 'melee-roy' AND sort_order = 3;
UPDATE target_slots SET file_code = 'Ye' WHERE target_id = 'melee-roy' AND sort_order = 4;
UPDATE targets SET file_code = 'Dr' WHERE id = 'melee-dr-mario';
UPDATE target_slots SET file_code = 'Nr' WHERE target_id = 'melee-dr-mario' AND sort_order = 0;
UPDATE target_slots SET file_code = 'Re' WHERE target_id = 'melee-dr-mario' AND sort_order = 1;
UPDATE target_slots SET file_code = 'Bu' WHERE target_id = 'melee-dr-mario' AND sort_order = 2;
UPDATE target_slots SET file_code = 'Gr' WHERE target_id = 'melee-dr-mario' AND sort_order = 3;
UPDATE target_slots SET file_code = 'Bk' WHERE target_id = 'melee-dr-mario' AND sort_order = 4;
