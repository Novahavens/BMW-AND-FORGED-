-- BMW paint corrections (owner-approved; mirrors data/configuratorData.ts BMW_PAINTS and the three palettes
-- below). Sources and evidence: docs/bmw-factory-paints.md ("Update 2026-10-04: verified codes, finishes").
-- Applied 2026-10-07 with the dark-studio car renders. Idempotent: every statement can be run again.
--
-- 1. Pearl finish type. The renderer treats it as gloss (only 'Frozen' is drawn matte).
-- 2. Hex values are the paints' true sRGB albedo. The car bodies are Blender renders recoloured in linear
--    light, so the old values (calibrated for the retired live-WebGL car: Alpine White #c8c8c9, Sao Paulo
--    Yellow #88a11c) are replaced; nothing is darkened or brightened to compensate for tone mapping.
-- 3. Finish types corrected where BMW states them: Riviera Blue, Mint Green, Voodoo Blue are solid (Uni);
--    Grigio Telesto, Twilight Purple, Bernina Grey Amber Effect, Sophisto Grey Brilliant Effect and
--    Mineral White are Pearl. P6K, U96, T42, 375 and P9L stay as they were: BMW does not state their finish.
-- 4. Two paints added: P92 Frozen Isle of Man Green, P9E Borusan Turkish Blue. 266 is BMW's "Laguna Green".
-- 5. Palettes: M4 CS has its own four colours; M8 uses C57 Aventurine Red III instead of X15 (X15 stays in the
--    table, inactive, so saved builds still open); M2 adds Borusan Turkish Blue and Voodoo Blue is active.
--
-- Per-finish numbers are the live ones (roughness, metalness, clearcoat, clearcoat_roughness): Metallic and
-- Pearl 0.45 / 0.8 / 1 / 0.05, Uni 0.5 / 0 / 1 / 0.05, Frozen 0.55 / 0.4 / 0 / 0.5. sort_order is only set
-- for new rows.

alter table public.paints drop constraint if exists paints_type_check;
alter table public.paints add constraint paints_type_check check (type in ('Metallic', 'Pearl', 'Frozen', 'Uni'));

insert into public.paints (id, name, code, hex, type, roughness, metalness, clearcoat, clearcoat_roughness, sort_order, active) values
  ('fire_red', 'Fire Red', 'C68', '#b0282e', 'Metallic', 0.45, 0.8, 1.0, 0.05, 0, true),
  ('skyscraper_grey', 'Skyscraper Grey', 'C4W', '#7f8587', 'Metallic', 0.45, 0.8, 1.0, 0.05, 1, true),
  ('brooklyn_grey', 'Brooklyn Grey', 'C4P', '#a4a9ac', 'Metallic', 0.45, 0.8, 1.0, 0.05, 2, true),
  ('black_sapphire', 'Black Sapphire', '475', '#15171b', 'Metallic', 0.45, 0.8, 1.0, 0.05, 3, true),
  ('portimao_blue', 'Portimao Blue', 'C31', '#2f4f94', 'Metallic', 0.45, 0.8, 1.0, 0.05, 4, true),
  ('zandvoort_blue', 'Zandvoort Blue', 'C6E', '#8fb1d8', 'Uni', 0.5, 0.0, 1.0, 0.05, 5, true),
  ('sao_paulo_yellow', 'São Paulo Yellow', 'C4H', '#f5c900', 'Uni', 0.5, 0.0, 1.0, 0.05, 6, true),
  ('alpine_white', 'Alpine White III', '300', '#f0f0ee', 'Uni', 0.5, 0.0, 1.0, 0.05, 7, true),
  ('frozen_portimao_blue_c6r', 'Frozen Portimao Blue', 'C6R', '#34478a', 'Frozen', 0.55, 0.4, 0.0, 0.5, 8, true),
  ('frozen_pure_grey', 'Frozen Pure Grey', 'C5A', '#8a9091', 'Frozen', 0.55, 0.4, 0.0, 0.5, 9, true),
  ('java_green', 'Java Green', 'P7V', '#7fa35f', 'Metallic', 0.45, 0.8, 1.0, 0.05, 10, true),
  ('grigio_telesto', 'Grigio Telesto', 'P6M', '#6f716d', 'Pearl', 0.45, 0.8, 1.0, 0.05, 11, true),
  ('twilight_purple', 'Twilight Purple', 'P28', '#6b3f6e', 'Pearl', 0.45, 0.8, 1.0, 0.05, 12, true),
  ('voodoo_blue', 'Voodoo Blue', 'P7L', '#1f7ac8', 'Uni', 0.5, 0.0, 1.0, 0.05, 13, true),
  ('thundernight', 'Thundernight', 'C56', '#483652', 'Metallic', 0.45, 0.8, 1.0, 0.05, 14, true),
  ('storm_bay', 'Storm Bay', 'C3N', '#6c747b', 'Metallic', 0.45, 0.8, 1.0, 0.05, 15, true),
  ('isle_of_man_green', 'Isle of Man Green', 'C4G', '#1b6a55', 'Metallic', 0.45, 0.8, 1.0, 0.05, 16, true),
  ('toronto_red', 'Toronto Red', 'C3G', '#c0302a', 'Metallic', 0.45, 0.8, 1.0, 0.05, 17, true),
  ('aventurine_red_iii', 'Aventurine Red III', 'C57', '#7a1f2b', 'Metallic', 0.45, 0.8, 1.0, 0.05, 18, true),
  ('tanzanite_blue_ii', 'Tanzanite Blue II', 'C3Z', '#1c2b4d', 'Metallic', 0.45, 0.8, 1.0, 0.05, 19, true),
  ('dravit_grey', 'Dravit Grey', 'C36', '#55575a', 'Metallic', 0.45, 0.8, 1.0, 0.05, 20, true),
  ('san_marino_blue', 'San Marino Blue', 'B51', '#2a3a6e', 'Metallic', 0.45, 0.8, 1.0, 0.05, 21, true),
  ('wildberry', 'Wildberry', 'T09', '#6a2c47', 'Metallic', 0.45, 0.8, 1.0, 0.05, 22, true),
  ('ruby_black', 'Ruby Black', 'X03', '#2a1c20', 'Metallic', 0.45, 0.8, 1.0, 0.05, 23, true),
  ('frozen_deep_green', 'Frozen Deep Green', 'P80', '#4d5b47', 'Frozen', 0.55, 0.4, 0.0, 0.5, 24, true),
  ('frozen_dark_grey_ii', 'Frozen Dark Grey II', 'P79', '#4c5052', 'Frozen', 0.55, 0.4, 0.0, 0.5, 25, true),
  ('fire_orange_iii', 'Fire Orange III', 'P7E', '#e2621a', 'Uni', 0.5, 0.0, 1.0, 0.05, 26, true),
  ('frozen_black', 'Frozen Black', 'U91', '#252627', 'Frozen', 0.55, 0.4, 0.0, 0.5, 27, true),
  ('thunder', 'Thunder', 'P6L', '#4e5558', 'Metallic', 0.45, 0.8, 1.0, 0.05, 28, true),
  ('mineral_white', 'Mineral White', 'A96', '#e6e4df', 'Pearl', 0.45, 0.8, 1.0, 0.05, 29, true),
  ('riviera_blue', 'Riviera Blue', 'P5C', '#22a6d6', 'Uni', 0.5, 0.0, 1.0, 0.05, 30, true),
  ('marina_bay_blue', 'Marina Bay Blue', 'C1K', '#2d4a8e', 'Metallic', 0.45, 0.8, 1.0, 0.05, 31, true),
  ('mint_green', 'Mint Green', 'W97', '#70b8a2', 'Uni', 0.5, 0.0, 1.0, 0.05, 32, true),
  ('sepia_iii', 'Sepia III', 'S0N', '#6a625e', 'Metallic', 0.45, 0.8, 1.0, 0.05, 33, true),
  ('frozen_tanzanite_blue', 'Frozen Tanzanite Blue', 'X1G', '#27345f', 'Frozen', 0.55, 0.4, 0.0, 0.5, 34, true),
  ('frozen_portimao_blue', 'Frozen Portimao Blue', 'X1E', '#34478a', 'Frozen', 0.55, 0.4, 0.0, 0.5, 35, true),
  ('frozen_pure_grey_ii', 'Frozen Pure Grey II', 'X1F', '#a8b0b3', 'Frozen', 0.55, 0.4, 0.0, 0.5, 36, true),
  ('anglesey_green', 'Anglesey Green', 'P9R', '#2d6a52', 'Metallic', 0.45, 0.8, 1.0, 0.05, 37, true),
  ('ruby_star', 'Ruby Star', 'P9L', '#a02a6b', 'Metallic', 0.45, 0.8, 1.0, 0.05, 38, true),
  ('frozen_brilliant_white', 'Frozen Brilliant White', 'X16', '#dcdcd6', 'Frozen', 0.55, 0.4, 0.0, 0.5, 39, true),
  ('frozen_preciosa_red', 'Frozen Preciosa Red', 'P9C', '#7a2427', 'Frozen', 0.55, 0.4, 0.0, 0.5, 40, true),
  ('malachite_green_ii', 'Malachite Green II', 'P85', '#4b5d4e', 'Metallic', 0.45, 0.8, 1.0, 0.05, 41, true),
  ('speed_yellow', 'Speed Yellow', 'U96', '#f0b800', 'Metallic', 0.45, 0.8, 1.0, 0.05, 42, true),
  ('brewster_green', 'Brewster Green', 'T42', '#2a352f', 'Metallic', 0.45, 0.8, 1.0, 0.05, 43, true),
  ('urban_green_ii', 'Urban Green II', 'P9P', '#5a5d43', 'Uni', 0.5, 0.0, 1.0, 0.05, 44, true),
  ('lagoon_green', 'Laguna Green', '266', '#2e7480', 'Metallic', 0.45, 0.8, 1.0, 0.05, 45, true),
  ('le_mans_blue', 'Le Mans Blue', '381', '#3a66a6', 'Metallic', 0.45, 0.8, 1.0, 0.05, 46, true),
  ('velvet_blue', 'Velvet Blue', '379', '#4a4b78', 'Metallic', 0.45, 0.8, 1.0, 0.05, 47, true),
  ('frozen_deep_grey', 'Frozen Deep Grey', 'P7X', '#515356', 'Frozen', 0.55, 0.4, 0.0, 0.5, 48, true),
  ('velvet_orchid_ii', 'Velvet Orchid II', 'L74', '#a58a96', 'Metallic', 0.45, 0.8, 1.0, 0.05, 49, true),
  ('carbon_black', 'Carbon Black', '416', '#1f2127', 'Metallic', 0.45, 0.8, 1.0, 0.05, 50, true),
  ('sophisto_grey_brilliant_effect', 'Sophisto Grey Brilliant Effect', 'A90', '#484a4e', 'Pearl', 0.45, 0.8, 1.0, 0.05, 51, true),
  ('damast_red', 'Damast Red', 'B03', '#5c2a2a', 'Metallic', 0.45, 0.8, 1.0, 0.05, 52, true),
  ('imola_red', 'Imola Red', '405', '#b01c1f', 'Uni', 0.5, 0.0, 1.0, 0.05, 53, true),
  ('nardo_grey', 'Nardo Grey', 'P6K', '#808284', 'Metallic', 0.45, 0.8, 1.0, 0.05, 54, true),
  ('oxford_green_ii', 'Oxford Green II', '430', '#2f4540', 'Metallic', 0.45, 0.8, 1.0, 0.05, 55, true),
  ('bernina_grey_amber_effect', 'Bernina Grey Amber Effect', 'C3E', '#77756d', 'Pearl', 0.45, 0.8, 1.0, 0.05, 56, true),
  ('frozen_deep_grey_c64', 'Frozen Deep Grey', 'C64', '#515356', 'Frozen', 0.55, 0.4, 0.0, 0.5, 57, true),
  ('barcelona_blue', 'Barcelona Blue', 'C38', '#8697a6', 'Metallic', 0.45, 0.8, 1.0, 0.05, 58, true),
  ('arctic_race_blue', 'Arctic Race Blue', 'C4F', '#5b7d92', 'Metallic', 0.45, 0.8, 1.0, 0.05, 59, true),
  ('dune_grey', 'Dune Grey', 'C7A', '#aeaba0', 'Metallic', 0.45, 0.8, 1.0, 0.05, 60, true),
  ('fire_red_ii', 'Fire Red II', '375', '#c0282c', 'Metallic', 0.45, 0.8, 1.0, 0.05, 61, true),
  ('sepang_bronze', 'Sepang Bronze', 'A32', '#7b6850', 'Metallic', 0.45, 0.8, 1.0, 0.05, 62, true),
  ('aventurin_red', 'Aventurin Red', 'X15', '#6a1612', 'Metallic', 0.45, 0.8, 1.0, 0.05, 63, false),
  ('frozen_isle_of_man_green', 'Frozen Isle of Man Green', 'P92', '#1d5a45', 'Frozen', 0.55, 0.4, 0.0, 0.5, 64, true),
  ('borusan_turkish_blue', 'Borusan Turkish Blue', 'P9E', '#25aed4', 'Uni', 0.5, 0.0, 1.0, 0.05, 65, true)
on conflict (id) do update set
  name = excluded.name,
  code = excluded.code,
  hex = excluded.hex,
  type = excluded.type,
  roughness = excluded.roughness,
  metalness = excluded.metalness,
  clearcoat = excluded.clearcoat,
  clearcoat_roughness = excluded.clearcoat_roughness;

-- Palettes (BMW's order)
update public.cars set paint_ids = array['riviera_blue', 'frozen_isle_of_man_green', 'brooklyn_grey', 'black_sapphire']::text[] where id = 'm4_cs_g82';
update public.cars set paint_ids = array['alpine_white', 'aventurine_red_iii', 'black_sapphire', 'brooklyn_grey', 'dravit_grey', 'frozen_pure_grey', 'frozen_tanzanite_blue', 'isle_of_man_green', 'marina_bay_blue', 'skyscraper_grey', 'tanzanite_blue_ii']::text[] where id = 'm8_f92';
update public.cars set paint_ids = array['fire_red', 'skyscraper_grey', 'brooklyn_grey', 'black_sapphire', 'portimao_blue', 'zandvoort_blue', 'sao_paulo_yellow', 'alpine_white', 'frozen_portimao_blue_c6r', 'frozen_pure_grey', 'java_green', 'grigio_telesto', 'twilight_purple', 'voodoo_blue', 'borusan_turkish_blue']::text[] where id = 'm2_g87';

-- Visibility: Voodoo Blue (P7L) is active again (its chip colour was found); the new paints are visible; X15
-- stays hidden. Other paints keep whatever visibility they have (admins may have changed it).
update public.paints set active = true where id in ('voodoo_blue', 'frozen_isle_of_man_green', 'borusan_turkish_blue');
update public.paints set active = false where id = 'aventurin_red';
