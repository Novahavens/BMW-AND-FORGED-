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
  ('fire_red', 'Fire Red', 'C68', '#8c2226', 'Metallic', 0.32, 0.45, 1.0, 0.04, 0, true),
  ('skyscraper_grey', 'Skyscraper Grey', 'C4W', '#555a5d', 'Metallic', 0.32, 0.45, 1.0, 0.04, 1, true),
  ('brooklyn_grey', 'Brooklyn Grey', 'C4P', '#889296', 'Metallic', 0.32, 0.45, 1.0, 0.04, 2, true), -- existing id
  ('black_sapphire', 'Black Sapphire', '475', '#151617', 'Metallic', 0.32, 0.45, 1.0, 0.04, 3, true), -- existing id
  ('portimao_blue', 'Portimao Blue', 'C31', '#1e3066', 'Metallic', 0.32, 0.45, 1.0, 0.04, 4, true),
  ('zandvoort_blue', 'Zandvoort Blue', 'C6E', '#547bad', 'Uni', 0.35, 0.0, 1.0, 0.04, 5, true),
  ('sao_paulo_yellow', 'São Paulo Yellow', 'C4H', '#88a11c', 'Uni', 0.35, 0.0, 1.0, 0.04, 6, true), -- existing id
  ('alpine_white', 'Alpine White III', '300', '#c8c8c9', 'Uni', 0.35, 0.0, 1.0, 0.04, 7, true), -- existing id
  ('frozen_portimao_blue_c6r', 'Frozen Portimao Blue', 'C6R', '#0e2357', 'Frozen', 0.55, 0.4, 0.0, 0.5, 8, true),
  ('frozen_pure_grey', 'Frozen Pure Grey', 'C5A', '#44494c', 'Frozen', 0.55, 0.4, 0.0, 0.5, 9, true),
  ('java_green', 'Java Green', 'P7V', '#638954', 'Metallic', 0.32, 0.45, 1.0, 0.04, 10, true), -- finish guessed
  ('grigio_telesto', 'Grigio Telesto', 'P6M', '#555858', 'Metallic', 0.32, 0.45, 1.0, 0.04, 11, true),
  ('twilight_purple', 'Twilight Purple', 'P28', '#5a2c4d', 'Metallic', 0.32, 0.45, 1.0, 0.04, 12, true), -- finish guessed
  ('voodoo_blue', 'Voodoo Blue', 'P7L', '#888888', 'Metallic', 0.32, 0.45, 1.0, 0.04, 13, false), -- finish guessed, no hex in doc: placeholder, inactive
  ('thundernight', 'Thundernight', 'C56', '#3a1f3d', 'Metallic', 0.32, 0.45, 1.0, 0.04, 14, true),
  ('storm_bay', 'Storm Bay', 'C3N', '#5f686e', 'Metallic', 0.32, 0.45, 1.0, 0.04, 15, true),
  ('isle_of_man_green', 'Isle of Man Green', 'C4G', '#0f5444', 'Metallic', 0.32, 0.45, 1.0, 0.04, 16, true), -- existing id
  ('toronto_red', 'Toronto Red', 'C3G', '#9d3307', 'Metallic', 0.32, 0.45, 1.0, 0.04, 17, true), -- existing id
  ('aventurine_red_iii', 'Aventurine Red III', 'C57', '#630f1c', 'Metallic', 0.32, 0.45, 1.0, 0.04, 18, true),
  ('tanzanite_blue_ii', 'Tanzanite Blue II', 'C3Z', '#151f32', 'Metallic', 0.32, 0.45, 1.0, 0.04, 19, true),
  ('dravit_grey', 'Dravit Grey', 'C36', '#3c4041', 'Metallic', 0.32, 0.45, 1.0, 0.04, 20, true),
  ('san_marino_blue', 'San Marino Blue', 'B51', '#092455', 'Metallic', 0.32, 0.45, 1.0, 0.04, 21, true), -- finish guessed
  ('wildberry', 'Wildberry', 'T09', '#5a2834', 'Metallic', 0.32, 0.45, 1.0, 0.04, 22, true),
  ('ruby_black', 'Ruby Black', 'X03', '#24181c', 'Metallic', 0.32, 0.45, 1.0, 0.04, 23, true),
  ('frozen_deep_green', 'Frozen Deep Green', 'P80', '#3f4d3c', 'Frozen', 0.55, 0.4, 0.0, 0.5, 24, true),
  ('frozen_dark_grey_ii', 'Frozen Dark Grey II', 'P79', '#2a3235', 'Frozen', 0.55, 0.4, 0.0, 0.5, 25, true),
  ('fire_orange_iii', 'Fire Orange III', 'P7E', '#975305', 'Uni', 0.35, 0.0, 1.0, 0.04, 26, true),
  ('frozen_black', 'Frozen Black', 'U91', '#18191b', 'Frozen', 0.55, 0.4, 0.0, 0.5, 27, true),
  ('thunder', 'Thunder', 'P6L', '#373f43', 'Metallic', 0.32, 0.45, 1.0, 0.04, 28, true),
  ('mineral_white', 'Mineral White', 'A96', '#ebeae9', 'Metallic', 0.32, 0.45, 1.0, 0.04, 29, true),
  ('riviera_blue', 'Riviera Blue', 'P5C', '#028fc1', 'Metallic', 0.32, 0.45, 1.0, 0.04, 30, true), -- finish guessed
  ('marina_bay_blue', 'Marina Bay Blue', 'C1K', '#1c4085', 'Metallic', 0.32, 0.45, 1.0, 0.04, 31, true), -- existing id
  ('mint_green', 'Mint Green', 'W97', '#409084', 'Metallic', 0.32, 0.45, 1.0, 0.04, 32, true), -- finish guessed
  ('sepia_iii', 'Sepia III', 'S0N', '#4b494b', 'Metallic', 0.32, 0.45, 1.0, 0.04, 33, true),
  ('frozen_tanzanite_blue', 'Frozen Tanzanite Blue', 'X1G', '#02023f', 'Frozen', 0.55, 0.4, 0.0, 0.5, 34, true),
  ('frozen_portimao_blue', 'Frozen Portimao Blue', 'X1E', '#0e2357', 'Frozen', 0.55, 0.4, 0.0, 0.5, 35, true),
  ('frozen_pure_grey_ii', 'Frozen Pure Grey II', 'X1F', '#717e82', 'Frozen', 0.55, 0.4, 0.0, 0.5, 36, true),
  ('anglesey_green', 'Anglesey Green', 'P9R', '#024b3a', 'Metallic', 0.32, 0.45, 1.0, 0.04, 37, true),
  ('ruby_star', 'Ruby Star', 'P9L', '#75084c', 'Metallic', 0.32, 0.45, 1.0, 0.04, 38, true), -- finish guessed
  ('frozen_brilliant_white', 'Frozen Brilliant White', 'X16', '#cbcec4', 'Frozen', 0.55, 0.4, 0.0, 0.5, 39, true),
  ('frozen_preciosa_red', 'Frozen Preciosa Red', 'P9C', '#510202', 'Frozen', 0.55, 0.4, 0.0, 0.5, 40, true),
  ('malachite_green_ii', 'Malachite Green II', 'P85', '#31433a', 'Metallic', 0.32, 0.45, 1.0, 0.04, 41, true), -- finish guessed
  ('speed_yellow', 'Speed Yellow', 'U96', '#b09918', 'Metallic', 0.32, 0.45, 1.0, 0.04, 42, true), -- finish guessed
  ('brewster_green', 'Brewster Green', 'T42', '#1a2c26', 'Metallic', 0.32, 0.45, 1.0, 0.04, 43, true), -- finish guessed
  ('urban_green_ii', 'Urban Green II', 'P9P', '#485037', 'Uni', 0.35, 0.0, 1.0, 0.04, 44, true),
  ('lagoon_green', 'Lagoon Green', '266', '#135861', 'Metallic', 0.32, 0.45, 1.0, 0.04, 45, true), -- finish guessed
  ('le_mans_blue', 'Le Mans Blue', '381', '#1c5185', 'Metallic', 0.32, 0.45, 1.0, 0.04, 46, true),
  ('velvet_blue', 'Velvet Blue', '379', '#342f58', 'Metallic', 0.32, 0.45, 1.0, 0.04, 47, true),
  ('frozen_deep_grey', 'Frozen Deep Grey', 'P7X', '#25292f', 'Frozen', 0.55, 0.4, 0.0, 0.5, 48, true), -- existing id
  ('velvet_orchid_ii', 'Velvet Orchid II', 'L74', '#806c72', 'Metallic', 0.32, 0.45, 1.0, 0.04, 49, true),
  ('carbon_black', 'Carbon Black', '416', '#0e1b2b', 'Metallic', 0.32, 0.45, 1.0, 0.04, 50, true),
  ('sophisto_grey_brilliant_effect', 'Sophisto Grey Brilliant Effect', 'A90', '#2b2c2b', 'Metallic', 0.32, 0.45, 1.0, 0.04, 51, true),
  ('damast_red', 'Damast Red', 'B03', '#45231f', 'Metallic', 0.32, 0.45, 1.0, 0.04, 52, true), -- finish guessed
  ('imola_red', 'Imola Red', '405', '#6e1b0d', 'Uni', 0.35, 0.0, 1.0, 0.04, 53, true),
  ('nardo_grey', 'Nardo Grey', 'P6K', '#666869', 'Metallic', 0.32, 0.45, 1.0, 0.04, 54, true), -- finish guessed
  ('oxford_green_ii', 'Oxford Green II', '430', '#1b3330', 'Metallic', 0.32, 0.45, 1.0, 0.04, 55, true),
  ('bernina_grey_amber_effect', 'Bernina Grey Amber Effect', 'C3E', '#575852', 'Metallic', 0.32, 0.45, 1.0, 0.04, 56, true),
  ('frozen_deep_grey_c64', 'Frozen Deep Grey', 'C64', '#242628', 'Frozen', 0.55, 0.4, 0.0, 0.5, 57, true),
  ('barcelona_blue', 'Barcelona Blue', 'C38', '#636f78', 'Metallic', 0.32, 0.45, 1.0, 0.04, 58, true),
  ('arctic_race_blue', 'Arctic Race Blue', 'C4F', '#30495b', 'Metallic', 0.32, 0.45, 1.0, 0.04, 59, true),
  ('dune_grey', 'Dune Grey', 'C7A', '#adada6', 'Metallic', 0.32, 0.45, 1.0, 0.04, 60, true),
  ('fire_red_ii', 'Fire Red II', '375', '#742002', 'Metallic', 0.32, 0.45, 1.0, 0.04, 61, true), -- finish guessed
  ('sepang_bronze', 'Sepang Bronze', 'A32', '#636054', 'Metallic', 0.32, 0.45, 1.0, 0.04, 62, true),
  ('aventurin_red', 'Aventurin Red', 'X15', '#530202', 'Metallic', 0.32, 0.45, 1.0, 0.04, 63, true)
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
