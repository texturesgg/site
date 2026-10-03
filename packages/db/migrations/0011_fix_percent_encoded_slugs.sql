-- The ssbmtextures import stored six slugs as literal percent-escapes. The API
-- decodes route params before matching, so these packs were unreachable. Replace
-- them with slugify() of the NFKC-normalized decoded text. Matching on the old
-- slug keeps this a no-op where the rows are absent or already fixed.
UPDATE packs SET slug = 'dim-dim-witted-color-pack-35434' WHERE id = '8gl9dFn5WFu3OoYlMiI8r' AND slug = '%f0%9d%93%93%f0%9d%93%b2%f0%9d%93%b6-%f0%9d%93%93%f0%9d%93%b2%f0%9d%93%b6-%f0%9d%93%a6%f0%9d%93%b2%f0%9d%93%bd%f0%9d%93%bd%f0%9d%93%ae%f0%9d%93%ad-color-pack-35434';--> statement-breakpoint
UPDATE packs SET slug = 'bob-omb-battlefield-fd-skin-10806' WHERE id = 'FfGNy23LArZuR3h8j0AoS' AND slug = 'bob-omb-battlefield-%cf%89-fd-skin-10806';--> statement-breakpoint
UPDATE packs SET slug = 'fixed-skirtless-peach-niche-edits-10671' WHERE id = 'b7bg1drccBXZrzT7TZVlN' AND slug = 'fixed-skirtless-peach-%e2%94%82-niche-edits-10671';--> statement-breakpoint
UPDATE packs SET slug = 'dodrio-pokemon-falco-skin-15583' WHERE id = '2Tvz8e_OL9MA2AFvWyqmd' AND slug = 'dodrio-%e2%99%82%ef%b8%8f-pokemon-falco-skin-15583';--> statement-breakpoint
UPDATE packs SET slug = 'zelda-animelee-35324' WHERE id = '_nZdVOONXcd_qwy1htLSZ' AND slug = '%e2%9a%a7-zelda-animelee-35324';--> statement-breakpoint
UPDATE packs SET slug = 'dodrio-pokemon-falco-animelee-skin-21859' WHERE id = 'GKjeRS26_LebU3QRkZjOL' AND slug = 'dodrio-%e2%99%82%ef%b8%8f-pokemon-falco-animelee-skin-21859';
