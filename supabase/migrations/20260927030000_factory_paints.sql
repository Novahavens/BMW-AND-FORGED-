-- Per-car BMW South Africa factory paint palettes, and six more BMW M cars.
--
-- Source: docs/bmw-factory-paints.md (BMW SA configurator, researched 2026-09-27; the M8 uses the
-- US 2025 MY palette because it is no longer on the SA configurator).
--
-- * cars.paint_ids lists the paints a car offers, in BMW's order (same pattern as
--   wheels.available_variants). An empty list means "all active paints".
-- * All 64 paint codes of the doc's master list are upserted. The eight existing rows keep their ids
--   (matched by BMW code: 300 alpine_white, 475 black_sapphire, C4P brooklyn_grey, P7X frozen_deep_grey,
--   C1K marina_bay_blue, C4H sao_paulo_yellow, C3G toronto_red, C4G isle_of_man_green), so saved share
--   codes keep working. New ids are the snake_case paint name without "BMW Individual", the "M" prefix,
--   the finish word or the code. Where two codes share a name, the less common one gets its code:
--   frozen_deep_grey (P7X) / frozen_deep_grey_c64 (C64), frozen_portimao_blue (X1E) / frozen_portimao_blue_c6r (C6R).
-- * Hex values are CALIBRATED base colours for the studio renderer, not the doc's raw swatch samples
--   (the swatches are lit chips, so dark and metallic paints read far too light: Black Sapphire samples
--   #4C4C4C but is near-black on the car). Method: for the 23 codes with a BMW car render, the base
--   colour was solved so our side-view door panel matches the door in BMW's render (CIEDE2000 < 1.2
--   for all but Imola-style deep solids); the other codes use a correction fitted on those 23
--   (swatch -> BMW-render lightness/chroma/hue model), then solved the same way. Details:
--   docs/bmw-factory-paints.md, "Renderer calibration".
-- * Type: Solid -> 'Uni', Metallic/pearl -> 'Metallic', Frozen -> 'Frozen'. PBR values are one set
--   per type: Uni is non-metallic under a gloss clearcoat, Metallic mixes 45 % metal under a gloss
--   clearcoat, Frozen is matte (no clearcoat, rough).
--
-- GUESSED FINISHES: the doc marks these finishes "unverified", and neither the name nor the BMW
-- category (ILACK = BMW Individual, which says nothing about the finish) settles it, so they are
-- 'Metallic' until confirmed with BMW:
--   P7V Java Green (java_green)
--   P28 Twilight Purple (twilight_purple)
--   P7L Voodoo Blue (voodoo_blue)
--   B51 San Marino Blue (san_marino_blue)
--   P5C Riviera Blue (riviera_blue)
--   W97 Mint Green (mint_green)
--   P9L Ruby Star (ruby_star)
--   P85 Malachite Green II (malachite_green_ii)
--   U96 Speed Yellow (speed_yellow)
--   T42 Brewster Green (brewster_green)
--   266 Lagoon Green (lagoon_green)
--   B03 Damast Red (damast_red)
--   P6K Nardo Grey (nardo_grey)
--   375 Fire Red II (fire_red_ii)
--
-- NO HEX: P7L Voodoo Blue (M2) is only an option card on the SA configurator, with no swatch, so the doc
-- has no colour for it. It is inserted with the placeholder #888888 and kept INACTIVE (it stays in the
-- M2's paint_ids, and the configurator skips inactive paints) until someone sets its colour in /admin.
--
-- Nothing is deleted or renamed: paints no active car offers are deactivated instead.

alter table public.cars add column if not exists paint_ids text[] not null default '{}';

-- Body styles for the new cars. The procedural placeholder body maps them to the nearest shape:
-- convertible -> coupe, touring and gran_coupe -> sedan (see CarConfiguratorEngine.proceduralShape).
alter table public.cars drop constraint if exists cars_body_style_check;
alter table public.cars add constraint cars_body_style_check
  check (body_style in ('coupe', 'sedan', 'suv', 'convertible', 'touring', 'gran_coupe'));

-- ---------------------------------------------------------------------------------------------
-- Paints
-- ---------------------------------------------------------------------------------------------
insert into public.paints (id, name, code, hex, type, roughness, metalness, clearcoat, clearcoat_roughness, sort_order, active) values
  ('fire_red', 'Fire Red', 'C68', '#934c50', 'Metallic', 0.18, 0.7, 0.95, 0.06, 0, true),
  ('skyscraper_grey', 'Skyscraper Grey', 'C4W', '#999e9d', 'Metallic', 0.18, 0.7, 0.95, 0.06, 1, true),
  ('brooklyn_grey', 'Brooklyn Grey', 'C4P', '#b6bbbb', 'Metallic', 0.18, 0.7, 0.95, 0.06, 2, true), -- existing id
  ('black_sapphire', 'Black Sapphire', '475', '#4c4c4c', 'Metallic', 0.18, 0.7, 0.95, 0.06, 3, true), -- existing id
  ('portimao_blue', 'Portimao Blue', 'C31', '#5b729f', 'Metallic', 0.18, 0.7, 0.95, 0.06, 4, true),
  ('zandvoort_blue', 'Zandvoort Blue', 'C6E', '#a1c1e2', 'Uni', 0.2, 0.15, 0.9, 0.1, 5, true),
  ('sao_paulo_yellow', 'São Paulo Yellow', 'C4H', '#c7c962', 'Uni', 0.2, 0.15, 0.9, 0.1, 6, true), -- existing id
  ('alpine_white', 'Alpine White III', '300', '#f4f4f4', 'Uni', 0.2, 0.15, 0.9, 0.1, 7, true), -- existing id
  ('frozen_portimao_blue_c6r', 'Frozen Portimao Blue', 'C6R', '#41507e', 'Frozen', 0.58, 0.35, 0.25, 0.45, 8, true),
  ('frozen_pure_grey', 'Frozen Pure Grey', 'C5A', '#919898', 'Frozen', 0.58, 0.35, 0.25, 0.45, 9, true),
  ('java_green', 'Java Green', 'P7V', '#9fb982', 'Metallic', 0.18, 0.7, 0.95, 0.06, 10, true), -- finish guessed
  ('grigio_telesto', 'Grigio Telesto', 'P6M', '#7d7e7a', 'Metallic', 0.18, 0.7, 0.95, 0.06, 11, true),
  ('twilight_purple', 'Twilight Purple', 'P28', '#815c78', 'Metallic', 0.18, 0.7, 0.95, 0.06, 12, true), -- finish guessed
  ('voodoo_blue', 'Voodoo Blue', 'P7L', '#888888', 'Metallic', 0.18, 0.7, 0.95, 0.06, 13, false), -- finish guessed, no hex in doc: placeholder, inactive
  ('thundernight', 'Thundernight', 'C56', '#5f4c65', 'Metallic', 0.18, 0.7, 0.95, 0.06, 14, true),
  ('storm_bay', 'Storm Bay', 'C3N', '#838b93', 'Metallic', 0.18, 0.7, 0.95, 0.06, 15, true),
  ('isle_of_man_green', 'Isle of Man Green', 'C4G', '#367462', 'Metallic', 0.18, 0.7, 0.95, 0.06, 16, true), -- existing id
  ('toronto_red', 'Toronto Red', 'C3G', '#cf5247', 'Metallic', 0.18, 0.7, 0.95, 0.06, 17, true), -- existing id
  ('aventurine_red_iii', 'Aventurine Red III', 'C57', '#804246', 'Metallic', 0.18, 0.7, 0.95, 0.06, 18, true),
  ('tanzanite_blue_ii', 'Tanzanite Blue II', 'C3Z', '#47628c', 'Metallic', 0.18, 0.7, 0.95, 0.06, 19, true),
  ('dravit_grey', 'Dravit Grey', 'C36', '#707071', 'Metallic', 0.18, 0.7, 0.95, 0.06, 20, true),
  ('san_marino_blue', 'San Marino Blue', 'B51', '#404d77', 'Metallic', 0.18, 0.7, 0.95, 0.06, 21, true), -- finish guessed
  ('wildberry', 'Wildberry', 'T09', '#835761', 'Metallic', 0.18, 0.7, 0.95, 0.06, 22, true),
  ('ruby_black', 'Ruby Black', 'X03', '#494142', 'Metallic', 0.18, 0.7, 0.95, 0.06, 23, true),
  ('frozen_deep_green', 'Frozen Deep Green', 'P80', '#78816f', 'Frozen', 0.58, 0.35, 0.25, 0.45, 24, true),
  ('frozen_dark_grey_ii', 'Frozen Dark Grey II', 'P79', '#606465', 'Frozen', 0.58, 0.35, 0.25, 0.45, 25, true),
  ('fire_orange_iii', 'Fire Orange III', 'P7E', '#d27e44', 'Uni', 0.2, 0.15, 0.9, 0.1, 26, true),
  ('frozen_black', 'Frozen Black', 'U91', '#4f4f4f', 'Frozen', 0.58, 0.35, 0.25, 0.45, 27, true),
  ('thunder', 'Thunder', 'P6L', '#656c6f', 'Metallic', 0.18, 0.7, 0.95, 0.06, 28, true),
  ('mineral_white', 'Mineral White', 'A96', '#ebeae9', 'Metallic', 0.18, 0.7, 0.95, 0.06, 29, true),
  ('riviera_blue', 'Riviera Blue', 'P5C', '#5abadb', 'Metallic', 0.18, 0.7, 0.95, 0.06, 30, true), -- finish guessed
  ('marina_bay_blue', 'Marina Bay Blue', 'C1K', '#4f629d', 'Metallic', 0.18, 0.7, 0.95, 0.06, 31, true), -- existing id
  ('mint_green', 'Mint Green', 'W97', '#81bfae', 'Metallic', 0.18, 0.7, 0.95, 0.06, 32, true), -- finish guessed
  ('sepia_iii', 'Sepia III', 'S0N', '#7c7879', 'Metallic', 0.18, 0.7, 0.95, 0.06, 33, true),
  ('frozen_tanzanite_blue', 'Frozen Tanzanite Blue', 'X1G', '#333f6c', 'Frozen', 0.58, 0.35, 0.25, 0.45, 34, true),
  ('frozen_portimao_blue', 'Frozen Portimao Blue', 'X1E', '#41507e', 'Frozen', 0.58, 0.35, 0.25, 0.45, 35, true),
  ('frozen_pure_grey_ii', 'Frozen Pure Grey II', 'X1F', '#aeb8ba', 'Frozen', 0.58, 0.35, 0.25, 0.45, 36, true),
  ('anglesey_green', 'Anglesey Green', 'P9R', '#3e7460', 'Metallic', 0.18, 0.7, 0.95, 0.06, 37, true),
  ('ruby_star', 'Ruby Star', 'P9L', '#a4537e', 'Metallic', 0.18, 0.7, 0.95, 0.06, 38, true), -- finish guessed
  ('frozen_brilliant_white', 'Frozen Brilliant White', 'X16', '#e9e9e4', 'Frozen', 0.58, 0.35, 0.25, 0.45, 39, true),
  ('frozen_preciosa_red', 'Frozen Preciosa Red', 'P9C', '#863e3a', 'Frozen', 0.58, 0.35, 0.25, 0.45, 40, true),
  ('malachite_green_ii', 'Malachite Green II', 'P85', '#616d63', 'Metallic', 0.18, 0.7, 0.95, 0.06, 41, true), -- finish guessed
  ('speed_yellow', 'Speed Yellow', 'U96', '#e2be60', 'Metallic', 0.18, 0.7, 0.95, 0.06, 42, true), -- finish guessed
  ('brewster_green', 'Brewster Green', 'T42', '#49534c', 'Metallic', 0.18, 0.7, 0.95, 0.06, 43, true), -- finish guessed
  ('urban_green_ii', 'Urban Green II', 'P9P', '#6d6f52', 'Uni', 0.2, 0.15, 0.9, 0.1, 44, true),
  ('lagoon_green', 'Lagoon Green', '266', '#58868b', 'Metallic', 0.18, 0.7, 0.95, 0.06, 45, true), -- finish guessed
  ('le_mans_blue', 'Le Mans Blue', '381', '#5681b4', 'Metallic', 0.18, 0.7, 0.95, 0.06, 46, true),
  ('velvet_blue', 'Velvet Blue', '379', '#5b5a7f', 'Metallic', 0.18, 0.7, 0.95, 0.06, 47, true),
  ('frozen_deep_grey', 'Frozen Deep Grey', 'P7X', '#5b5c5f', 'Frozen', 0.58, 0.35, 0.25, 0.45, 48, true), -- existing id
  ('velvet_orchid_ii', 'Velvet Orchid II', 'L74', '#b29ca4', 'Metallic', 0.18, 0.7, 0.95, 0.06, 49, true),
  ('carbon_black', 'Carbon Black', '416', '#393a41', 'Metallic', 0.18, 0.7, 0.95, 0.06, 50, true),
  ('sophisto_grey_brilliant_effect', 'Sophisto Grey Brilliant Effect', 'A90', '#626366', 'Metallic', 0.18, 0.7, 0.95, 0.06, 51, true),
  ('damast_red', 'Damast Red', 'B03', '#6f4e4d', 'Metallic', 0.18, 0.7, 0.95, 0.06, 52, true), -- finish guessed
  ('imola_red', 'Imola Red', '405', '#903131', 'Uni', 0.2, 0.15, 0.9, 0.1, 53, true),
  ('nardo_grey', 'Nardo Grey', 'P6K', '#9c9c9c', 'Metallic', 0.18, 0.7, 0.95, 0.06, 54, true), -- finish guessed
  ('oxford_green_ii', 'Oxford Green II', '430', '#4c5c58', 'Metallic', 0.18, 0.7, 0.95, 0.06, 55, true),
  ('bernina_grey_amber_effect', 'Bernina Grey Amber Effect', 'C3E', '#8a8a84', 'Metallic', 0.18, 0.7, 0.95, 0.06, 56, true),
  ('frozen_deep_grey_c64', 'Frozen Deep Grey', 'C64', '#5a5a5a', 'Frozen', 0.58, 0.35, 0.25, 0.45, 57, true),
  ('barcelona_blue', 'Barcelona Blue', 'C38', '#94a0a9', 'Metallic', 0.18, 0.7, 0.95, 0.06, 58, true),
  ('arctic_race_blue', 'Arctic Race Blue', 'C4F', '#8095a2', 'Metallic', 0.18, 0.7, 0.95, 0.06, 59, true),
  ('dune_grey', 'Dune Grey', 'C7A', '#bcbab0', 'Metallic', 0.18, 0.7, 0.95, 0.06, 60, true),
  ('fire_red_ii', 'Fire Red II', '375', '#ad5245', 'Metallic', 0.18, 0.7, 0.95, 0.06, 61, true), -- finish guessed
  ('sepang_bronze', 'Sepang Bronze', 'A32', '#999284', 'Metallic', 0.18, 0.7, 0.95, 0.06, 62, true),
  ('aventurin_red', 'Aventurin Red', 'X15', '#65110f', 'Metallic', 0.18, 0.7, 0.95, 0.06, 63, true)
on conflict (id) do update set
  name = excluded.name,
  code = excluded.code,
  hex = excluded.hex,
  type = excluded.type,
  roughness = excluded.roughness,
  metalness = excluded.metalness,
  clearcoat = excluded.clearcoat,
  clearcoat_roughness = excluded.clearcoat_roughness,
  sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------------------------
-- New cars (no 3D model yet; specs deliberately left blank, the client does not need them)
-- ---------------------------------------------------------------------------------------------
-- The M3 "convertible" does not exist (last one was the E93), so the M3 Touring stands in; the X3 M
-- ended in 2024 with no successor, so the X3 M50 xDrive (M Performance, G45) stands in.
insert into public.cars (id, name, badge, generation, chassis_code, body_style, sort_order) values
  ('m235_f74', 'BMW M235 xDrive Gran Coupé', 'M235 F74', 'F74', 'F74 M235', 'gran_coupe', 5),
  ('m3_touring_g81', 'BMW M3 Competition Touring', 'M3 Touring G81', 'G81', 'G81 M3 Touring', 'touring', 3),
  ('m4_convertible_g83', 'BMW M4 Competition Convertible', 'M4 Convertible G83', 'G83', 'G83 M4 Convertible', 'convertible', 1),
  ('m5_touring_g99', 'BMW M5 Touring', 'M5 Touring G99', 'G99', 'G99 M5 Touring', 'touring', 7),
  ('m8_f92', 'BMW M8 Competition Coupé', 'M8 F92', 'F92', 'F92 M8', 'coupe', 8),
  ('x3m50_g45', 'BMW X3 M50 xDrive', 'X3 M50 G45', 'G45', 'G45 X3 M50', 'suv', 9)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------------------------
-- Palettes (BMW's order) and showroom order: each body variant next to its sibling
-- ---------------------------------------------------------------------------------------------
update public.cars c set paint_ids = v.paint_ids, sort_order = v.sort_order
from (values
  ('m4_g82', array['skyscraper_grey', 'brooklyn_grey', 'isle_of_man_green', 'black_sapphire', 'toronto_red', 'portimao_blue', 'sao_paulo_yellow', 'alpine_white', 'aventurine_red_iii', 'tanzanite_blue_ii', 'dravit_grey', 'san_marino_blue', 'velvet_blue', 'java_green', 'frozen_dark_grey_ii', 'speed_yellow', 'frozen_pure_grey', 'frozen_black', 'marina_bay_blue', 'frozen_portimao_blue', 'frozen_brilliant_white']::text[], 0),
  ('m4_convertible_g83', array['skyscraper_grey', 'brooklyn_grey', 'isle_of_man_green', 'black_sapphire', 'toronto_red', 'portimao_blue', 'sao_paulo_yellow', 'alpine_white', 'aventurine_red_iii', 'tanzanite_blue_ii', 'dravit_grey', 'frozen_deep_grey', 'velvet_orchid_ii', 'frozen_portimao_blue', 'frozen_brilliant_white']::text[], 1),
  ('m3_g80', array['skyscraper_grey', 'brooklyn_grey', 'isle_of_man_green', 'black_sapphire', 'toronto_red', 'portimao_blue', 'sao_paulo_yellow', 'alpine_white', 'aventurine_red_iii', 'tanzanite_blue_ii', 'dravit_grey', 'san_marino_blue', 'wildberry', 'ruby_black', 'frozen_deep_green', 'frozen_dark_grey_ii', 'fire_orange_iii', 'frozen_black', 'thunder', 'mineral_white', 'riviera_blue', 'marina_bay_blue', 'mint_green', 'sepia_iii', 'twilight_purple', 'frozen_tanzanite_blue', 'frozen_portimao_blue', 'frozen_pure_grey_ii', 'anglesey_green', 'ruby_star', 'frozen_brilliant_white', 'frozen_preciosa_red']::text[], 2),
  ('m3_touring_g81', array['skyscraper_grey', 'brooklyn_grey', 'isle_of_man_green', 'black_sapphire', 'toronto_red', 'portimao_blue', 'sao_paulo_yellow', 'alpine_white', 'aventurine_red_iii', 'tanzanite_blue_ii', 'dravit_grey', 'malachite_green_ii', 'speed_yellow', 'frozen_black', 'riviera_blue', 'brewster_green', 'sepia_iii', 'twilight_purple', 'frozen_portimao_blue', 'frozen_pure_grey_ii', 'anglesey_green', 'urban_green_ii', 'ruby_star', 'frozen_brilliant_white', 'lagoon_green', 'le_mans_blue']::text[], 3),
  ('m2_g87', array['fire_red', 'skyscraper_grey', 'brooklyn_grey', 'black_sapphire', 'portimao_blue', 'zandvoort_blue', 'sao_paulo_yellow', 'alpine_white', 'frozen_portimao_blue_c6r', 'frozen_pure_grey', 'java_green', 'grigio_telesto', 'twilight_purple', 'voodoo_blue']::text[], 4),
  ('m235_f74', array['fire_red', 'skyscraper_grey', 'thundernight', 'brooklyn_grey', 'black_sapphire', 'portimao_blue', 'alpine_white', 'frozen_portimao_blue_c6r', 'frozen_pure_grey', 'storm_bay']::text[], 5),
  ('m5_g90', array['carbon_black', 'fire_red', 'marina_bay_blue', 'brooklyn_grey', 'sophisto_grey_brilliant_effect', 'isle_of_man_green', 'black_sapphire', 'damast_red', 'fire_orange_iii', 'imola_red', 'speed_yellow', 'frozen_black', 'nardo_grey', 'mineral_white', 'oxford_green_ii', 'bernina_grey_amber_effect', 'alpine_white', 'storm_bay', 'frozen_deep_grey_c64']::text[], 6),
  ('m5_touring_g99', array['carbon_black', 'fire_red', 'marina_bay_blue', 'brooklyn_grey', 'sophisto_grey_brilliant_effect', 'isle_of_man_green', 'black_sapphire', 'urban_green_ii', 'barcelona_blue', 'alpine_white', 'storm_bay', 'frozen_deep_grey_c64']::text[], 7),
  ('m8_f92', array['alpine_white', 'aventurin_red', 'black_sapphire', 'brooklyn_grey', 'dravit_grey', 'frozen_pure_grey', 'frozen_tanzanite_blue', 'isle_of_man_green', 'marina_bay_blue', 'skyscraper_grey', 'tanzanite_blue_ii']::text[], 8),
  ('x3m50_g45', array['fire_red', 'brooklyn_grey', 'sophisto_grey_brilliant_effect', 'arctic_race_blue', 'black_sapphire', 'dune_grey', 'alpine_white', 'tanzanite_blue_ii', 'frozen_deep_grey_c64', 'frozen_pure_grey']::text[], 9),
  ('x5m_f95', array['carbon_black', 'mineral_white', 'brooklyn_grey', 'isle_of_man_green', 'black_sapphire', 'toronto_red', 'fire_red_ii', 'anglesey_green', 'sepang_bronze', 'alpine_white', 'dravit_grey']::text[], 10)
) as v(id, paint_ids, sort_order)
where c.id = v.id;

-- Paints that no active car offers are hidden (never deleted: saved share codes may point at them).
update public.paints p set active = exists (
  select 1 from public.cars c where c.active and p.id = any (c.paint_ids)
);
update public.paints set active = false where id = 'voodoo_blue';
