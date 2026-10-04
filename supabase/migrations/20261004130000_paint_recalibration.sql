-- Paint recalibration, finish classes and palette fixes (2026-10-04). Mirrors data/configuratorData.ts
-- (BMW_PAINTS and the M4 CS / M8 / M2 palettes); sources and method in docs/bmw-factory-paints.md
-- ("Update 2026-10-04" and "Recalibration (2026-10-04)").
--
-- Apply together with the app release that carries the new paint finish code (services/paintShader.ts,
-- CarConfiguratorEngine.applyPaintColor): the base colours below are solved for the new finish values
-- and lighting, and look wrong on the old renderer (and the old colours look wrong on the new one).

-- 1. A Pearl finish type (pearl, xirallic and amber-effect paints)
alter table public.paints drop constraint if exists paints_type_check;
alter table public.paints add constraint paints_type_check check (type in ('Metallic', 'Pearl', 'Frozen', 'Uni'));

-- 2. Every paint: recalibrated base colour, corrected finish type and per-finish values, two new
--    paints (P92 Frozen Isle of Man Green, P9E Borusan Turkish Blue), Voodoo Blue active, X15 inactive
insert into public.paints (id, name, code, hex, type, roughness, metalness, clearcoat, clearcoat_roughness, sort_order, active) values
  ('fire_red', 'Fire Red', 'C68', '#a03133', 'Metallic', 0.38, 0.6, 1.0, 0.03, 0, true),
  ('skyscraper_grey', 'Skyscraper Grey', 'C4W', '#62676a', 'Metallic', 0.38, 0.6, 1.0, 0.03, 1, true),
  ('brooklyn_grey', 'Brooklyn Grey', 'C4P', '#9da8ad', 'Metallic', 0.38, 0.6, 1.0, 0.03, 2, true),
  ('black_sapphire', 'Black Sapphire', '475', '#212223', 'Metallic', 0.38, 0.6, 1.0, 0.03, 3, true),
  ('portimao_blue', 'Portimao Blue', 'C31', '#2a3c74', 'Metallic', 0.38, 0.6, 1.0, 0.03, 4, true),
  ('zandvoort_blue', 'Zandvoort Blue', 'C6E', '#5479a8', 'Uni', 0.4, 0.0, 1.0, 0.03, 5, true),
  ('sao_paulo_yellow', 'São Paulo Yellow', 'C4H', '#859d25', 'Uni', 0.4, 0.0, 1.0, 0.03, 6, true),
  ('alpine_white', 'Alpine White III', '300', '#c3c2c3', 'Uni', 0.4, 0.0, 1.0, 0.03, 7, true),
  ('frozen_portimao_blue_c6r', 'Frozen Portimao Blue', 'C6R', '#01145d', 'Frozen', 0.58, 0.6, 1.0, 0.45, 8, true),
  ('frozen_pure_grey', 'Frozen Pure Grey', 'C5A', '#464c50', 'Frozen', 0.58, 0.6, 1.0, 0.45, 9, true),
  ('java_green', 'Java Green', 'P7V', '#7a9b5d', 'Metallic', 0.38, 0.6, 1.0, 0.03, 10, true),
  ('grigio_telesto', 'Grigio Telesto', 'P6M', '#555757', 'Pearl', 0.4, 0.45, 1.0, 0.03, 11, true),
  ('twilight_purple', 'Twilight Purple', 'P28', '#562e50', 'Pearl', 0.4, 0.45, 1.0, 0.03, 12, true),
  ('voodoo_blue', 'Voodoo Blue', 'P7L', '#025582', 'Uni', 0.4, 0.0, 1.0, 0.03, 13, true),
  ('thundernight', 'Thundernight', 'C56', '#412b4a', 'Metallic', 0.38, 0.6, 1.0, 0.03, 14, true),
  ('storm_bay', 'Storm Bay', 'C3N', '#6d777e', 'Metallic', 0.38, 0.6, 1.0, 0.03, 15, true),
  ('isle_of_man_green', 'Isle of Man Green', 'C4G', '#0f6150', 'Metallic', 0.38, 0.6, 1.0, 0.03, 16, true),
  ('toronto_red', 'Toronto Red', 'C3G', '#b5421a', 'Metallic', 0.38, 0.6, 1.0, 0.03, 17, true),
  ('aventurine_red_iii', 'Aventurine Red III', 'C57', '#711d28', 'Metallic', 0.38, 0.6, 1.0, 0.03, 18, true),
  ('tanzanite_blue_ii', 'Tanzanite Blue II', 'C3Z', '#222a3c', 'Metallic', 0.38, 0.6, 1.0, 0.03, 19, true),
  ('dravit_grey', 'Dravit Grey', 'C36', '#474c4d', 'Metallic', 0.38, 0.6, 1.0, 0.03, 20, true),
  ('san_marino_blue', 'San Marino Blue', 'B51', '#093263', 'Metallic', 0.38, 0.6, 1.0, 0.03, 21, true),
  ('wildberry', 'Wildberry', 'T09', '#663343', 'Metallic', 0.38, 0.6, 1.0, 0.03, 22, true),
  ('ruby_black', 'Ruby Black', 'X03', '#2f2427', 'Metallic', 0.38, 0.6, 1.0, 0.03, 23, true),
  ('frozen_deep_green', 'Frozen Deep Green', 'P80', '#425139', 'Frozen', 0.58, 0.6, 1.0, 0.45, 24, true),
  ('frozen_dark_grey_ii', 'Frozen Dark Grey II', 'P79', '#202d31', 'Frozen', 0.58, 0.6, 1.0, 0.45, 25, true),
  ('fire_orange_iii', 'Fire Orange III', 'P7E', '#985021', 'Uni', 0.4, 0.0, 1.0, 0.03, 26, true),
  ('frozen_black', 'Frozen Black', 'U91', '#050608', 'Frozen', 0.58, 0.6, 1.0, 0.45, 27, true),
  ('thunder', 'Thunder', 'P6L', '#424b4e', 'Metallic', 0.38, 0.6, 1.0, 0.03, 28, true),
  ('mineral_white', 'Mineral White', 'A96', '#adabaa', 'Pearl', 0.4, 0.15, 1.0, 0.03, 29, true),
  ('riviera_blue', 'Riviera Blue', 'P5C', '#016586', 'Uni', 0.4, 0.0, 1.0, 0.03, 30, true),
  ('marina_bay_blue', 'Marina Bay Blue', 'C1K', '#204d98', 'Metallic', 0.38, 0.6, 1.0, 0.03, 31, true),
  ('mint_green', 'Mint Green', 'W97', '#2f6a5d', 'Uni', 0.4, 0.0, 1.0, 0.03, 32, true),
  ('sepia_iii', 'Sepia III', 'S0N', '#575457', 'Metallic', 0.38, 0.6, 1.0, 0.03, 33, true),
  ('frozen_tanzanite_blue', 'Frozen Tanzanite Blue', 'X1G', '#01013f', 'Frozen', 0.58, 0.6, 1.0, 0.45, 34, true),
  ('frozen_portimao_blue', 'Frozen Portimao Blue', 'X1E', '#011960', 'Frozen', 0.58, 0.6, 1.0, 0.45, 35, true),
  ('frozen_pure_grey_ii', 'Frozen Pure Grey II', 'X1F', '#7e8e92', 'Frozen', 0.58, 0.6, 1.0, 0.45, 36, true),
  ('anglesey_green', 'Anglesey Green', 'P9R', '#395641', 'Metallic', 0.38, 0.6, 1.0, 0.03, 37, true),
  ('ruby_star', 'Ruby Star', 'P9L', '#56183d', 'Uni', 0.4, 0.0, 1.0, 0.03, 38, true),
  ('frozen_brilliant_white', 'Frozen Brilliant White', 'X16', '#b2b3a9', 'Frozen', 0.6, 0.2, 1.0, 0.5, 39, true),
  ('frozen_preciosa_red', 'Frozen Preciosa Red', 'P9C', '#550101', 'Frozen', 0.58, 0.6, 1.0, 0.45, 40, true),
  ('malachite_green_ii', 'Malachite Green II', 'P85', '#3e4e43', 'Metallic', 0.38, 0.6, 1.0, 0.03, 41, true),
  ('speed_yellow', 'Speed Yellow', 'U96', '#856b15', 'Uni', 0.4, 0.0, 1.0, 0.03, 42, true),
  ('brewster_green', 'Brewster Green', 'T42', '#18221d', 'Uni', 0.4, 0.0, 1.0, 0.03, 43, true),
  ('urban_green_ii', 'Urban Green II', 'P9P', '#4c5039', 'Uni', 0.4, 0.0, 1.0, 0.03, 44, true),
  ('lagoon_green', 'Laguna Green', '266', '#13656d', 'Metallic', 0.38, 0.6, 1.0, 0.03, 45, true),
  ('le_mans_blue', 'Le Mans Blue', '381', '#1c6299', 'Metallic', 0.38, 0.6, 1.0, 0.03, 46, true),
  ('velvet_blue', 'Velvet Blue', '379', '#353c67', 'Metallic', 0.38, 0.6, 1.0, 0.03, 47, true),
  ('frozen_deep_grey', 'Frozen Deep Grey', 'P7X', '#171f28', 'Frozen', 0.58, 0.6, 1.0, 0.45, 48, true),
  ('velvet_orchid_ii', 'Velvet Orchid II', 'L74', '#907d85', 'Metallic', 0.38, 0.6, 1.0, 0.03, 49, true),
  ('carbon_black', 'Carbon Black', '416', '#1c2736', 'Metallic', 0.38, 0.6, 1.0, 0.03, 50, true),
  ('sophisto_grey_brilliant_effect', 'Sophisto Grey Brilliant Effect', 'A90', '#2d2c2b', 'Pearl', 0.4, 0.45, 1.0, 0.03, 51, true),
  ('damast_red', 'Damast Red', 'B03', '#502e2f', 'Metallic', 0.38, 0.6, 1.0, 0.03, 52, true),
  ('imola_red', 'Imola Red', '405', '#6e2823', 'Uni', 0.4, 0.0, 1.0, 0.03, 53, true),
  ('nardo_grey', 'Nardo Grey', 'P6K', '#4d4e4e', 'Uni', 0.4, 0.0, 1.0, 0.03, 54, true),
  ('oxford_green_ii', 'Oxford Green II', '430', '#283d39', 'Metallic', 0.38, 0.6, 1.0, 0.03, 55, true),
  ('bernina_grey_amber_effect', 'Bernina Grey Amber Effect', 'C3E', '#575751', 'Pearl', 0.4, 0.45, 1.0, 0.03, 56, true),
  ('frozen_deep_grey_c64', 'Frozen Deep Grey', 'C64', '#161a1c', 'Frozen', 0.58, 0.6, 1.0, 0.45, 57, true),
  ('barcelona_blue', 'Barcelona Blue', 'C38', '#717f88', 'Metallic', 0.38, 0.6, 1.0, 0.03, 58, true),
  ('arctic_race_blue', 'Arctic Race Blue', 'C4F', '#3b5568', 'Metallic', 0.38, 0.6, 1.0, 0.03, 59, true),
  ('dune_grey', 'Dune Grey', 'C7A', '#c9cac2', 'Metallic', 0.38, 0.6, 1.0, 0.03, 60, true),
  ('fire_red_ii', 'Fire Red II', '375', '#591617', 'Uni', 0.4, 0.0, 1.0, 0.03, 61, true),
  ('sepang_bronze', 'Sepang Bronze', 'A32', '#736d61', 'Metallic', 0.38, 0.6, 1.0, 0.03, 62, true),
  ('aventurin_red', 'Aventurin Red', 'X15', '#601324', 'Metallic', 0.38, 0.6, 1.0, 0.03, 63, false),
  ('frozen_isle_of_man_green', 'Frozen Isle of Man Green', 'P92', '#01300b', 'Frozen', 0.58, 0.6, 1.0, 0.45, 64, true),
  ('borusan_turkish_blue', 'Borusan Turkish Blue', 'P9E', '#016786', 'Uni', 0.4, 0.0, 1.0, 0.03, 65, true)
on conflict (id) do update set
  name = excluded.name,
  code = excluded.code,
  hex = excluded.hex,
  type = excluded.type,
  roughness = excluded.roughness,
  metalness = excluded.metalness,
  clearcoat = excluded.clearcoat,
  clearcoat_roughness = excluded.clearcoat_roughness,
  active = excluded.active;

-- 3. Palettes: the M4 CS's own four colours (BMW SA press kit), C57 instead of X15 on the M8, Borusan
--    Turkish Blue on the M2 (BMW Individual Visualizer, G87)
update public.cars set paint_ids = array['riviera_blue', 'frozen_isle_of_man_green', 'brooklyn_grey', 'black_sapphire'] where id = 'm4_cs_g82';
update public.cars set paint_ids = array['alpine_white', 'aventurine_red_iii', 'black_sapphire', 'brooklyn_grey', 'dravit_grey', 'frozen_pure_grey', 'frozen_tanzanite_blue', 'isle_of_man_green', 'marina_bay_blue', 'skyscraper_grey', 'tanzanite_blue_ii'] where id = 'm8_f92';
update public.cars set paint_ids = array['fire_red', 'skyscraper_grey', 'brooklyn_grey', 'black_sapphire', 'portimao_blue', 'zandvoort_blue', 'sao_paulo_yellow', 'alpine_white', 'frozen_portimao_blue_c6r', 'frozen_pure_grey', 'java_green', 'grigio_telesto', 'twilight_purple', 'voodoo_blue', 'borusan_turkish_blue'] where id = 'm2_g87';
