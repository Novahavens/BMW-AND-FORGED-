-- Factory (OE) tyre per car, drawn on the 3D tyre sidewalls (services/wheelKit.ts).
--
-- Owner-approved exception (Oct 2026): the tyre carries the brand BMW fits to the car. The brand and
-- model are drawn as plain moulded lettering in a neutral bold condensed sans; no tyre-maker logo
-- artwork. The BMW star approval marking (★) and the regulatory text (size, load/speed, DOT, TWI,
-- TUBELESS) are drawn too. `{}` (no front/rear size) = generic markings.
--
-- Shape: { brand, model, marking?, front, rear } — inner keys are single words because
-- catalogService.rowToApp only camelCases top-level keys. Sizes are written as on the sidewall.
-- Mirrors `tyre` in data/configuratorData.ts.
--
-- Sources (checked 4 Oct 2026). BMW press kits give sizes but rarely the tyre maker; where several
-- makers are homologated, the brand comes from the tyre maker's own BMW OE announcement.
--   m3_g80, m3_touring_g81, m4_convertible_g83, m2_g87: 275/35 ZR19 100Y XL / 285/30 ZR20 99Y XL on
--     9.5J x 19 / 10.5J x 20 (M2: press.bmwgroup.com/usa/article/detail/T0443102EN_US). Brand: Michelin
--     Pilot Sport 4S ★, developed for the M3/M4 (michelinman.com/partnership/bmw). Pirelli P Zero ★ and
--     Michelin Pilot Sport S 5 ★ are also delivered on later cars (owner reports, g80.bimmerpost.com).
--   m4_g82: the configurator's M4 sits on the optional 20" / 21" M wheels: 275/35 ZR20 102Y XL /
--     285/30 ZR21 100Y XL (★ size listed by Michelin: michelinman.com/auto/browse-tires/by-dimension/275/35/20/102/Y).
--   m4_cs_g82: Michelin Pilot Sport Cup 2 standard (Cup 2 R optional), 275/35 ZR19 / 285/30 ZR20 on
--     forged 19" / 20" wheels (press.bmwgroup.com/united-kingdom/article/detail/T0441761EN_GB).
--   m5_g90, m5_touring_g99: 285/40 ZR20 111Y XL / 295/35 ZR21 110Y XL
--     (press.bmwgroup.com/usa/article/detail/T0443395EN_US). The new Pirelli P Zero is homologated for the
--     M5 and M5 Touring (pirelli.com/tires/en-us/car/press-releases/pirelli-new-pzero); Michelin Pilot
--     Sport S 5 ★ and Hankook Ventus S1 evo Z are fitted too (michelinman.com/partnership/bmw,
--     g90.bimmerpost.com "Tire lottery").
--   m8_f92: 275/35 ZR20 102Y XL / 285/35 ZR20 104Y XL on 9.5J / 10.5J x 20
--     (press.bmwgroup.com/global/article/attachment/T0330570EN/477179); Michelin Pilot Sport 4S on
--     delivered cars (f92.bimmerpost.com, Tire Rack OE listing).
--   x3m50_g45: 255/45 R20 / 285/40 R20 on 9.0J / 10.5J x 20 (press.bmwgroup.com/canada/article/detail/T0443201EN).
--     Brand not named by BMW; Pirelli P Zero ★ (P Zero All Season ★ in the US) on delivered cars
--     (g45.bimmerpost.com "What tire did you get?"). Load index not published by BMW, so not drawn.
--   x5m_f95: 295/35 ZR21 107Y XL / 315/30 ZR22 107Y XL (Big O / Tire Rack OE sizes for the 2023-25
--     X5 M Competition); Michelin Pilot Sport 4S ★ (Michelin Premium Touch OE listing on Tire Rack).
--   m235_f74: 235/40 R19 96Y XL on the 19" option (OE size listed by BFGoodrich for the 2025 M235
--     xDrive Gran Coupé). No tyre maker could be verified, so brand and model stay empty: generic
--     lettering with the OE size.

alter table public.cars add column if not exists tyre jsonb not null default '{}';

update public.cars c set tyre = v.tyre::jsonb
from (values
  ('m4_g82',             '{"brand":"Michelin","model":"Pilot Sport 4S","marking":"★","front":"275/35 ZR20 102Y XL","rear":"285/30 ZR21 100Y XL"}'),
  ('m4_cs_g82',          '{"brand":"Michelin","model":"Pilot Sport Cup 2","marking":"★","front":"275/35 ZR19 100Y XL","rear":"285/30 ZR20 99Y XL"}'),
  ('m4_convertible_g83', '{"brand":"Michelin","model":"Pilot Sport 4S","marking":"★","front":"275/35 ZR19 100Y XL","rear":"285/30 ZR20 99Y XL"}'),
  ('m3_g80',             '{"brand":"Michelin","model":"Pilot Sport 4S","marking":"★","front":"275/35 ZR19 100Y XL","rear":"285/30 ZR20 99Y XL"}'),
  ('m3_touring_g81',     '{"brand":"Michelin","model":"Pilot Sport 4S","marking":"★","front":"275/35 ZR19 100Y XL","rear":"285/30 ZR20 99Y XL"}'),
  ('m2_g87',             '{"brand":"Michelin","model":"Pilot Sport 4S","marking":"★","front":"275/35 ZR19 100Y XL","rear":"285/30 ZR20 99Y XL"}'),
  ('m235_f74',           '{"brand":"","model":"","front":"235/40 R19 96Y XL","rear":"235/40 R19 96Y XL"}'),
  ('m5_g90',             '{"brand":"Pirelli","model":"P Zero","marking":"★","front":"285/40 ZR20 111Y XL","rear":"295/35 ZR21 110Y XL"}'),
  ('m5_touring_g99',     '{"brand":"Pirelli","model":"P Zero","marking":"★","front":"285/40 ZR20 111Y XL","rear":"295/35 ZR21 110Y XL"}'),
  ('m8_f92',             '{"brand":"Michelin","model":"Pilot Sport 4S","marking":"★","front":"275/35 ZR20 102Y XL","rear":"285/35 ZR20 104Y XL"}'),
  ('x3m50_g45',          '{"brand":"Pirelli","model":"P Zero","marking":"★","front":"255/45 R20","rear":"285/40 R20"}'),
  ('x5m_f95',            '{"brand":"Michelin","model":"Pilot Sport 4S","marking":"★","front":"295/35 ZR21 107Y XL","rear":"315/30 ZR22 107Y XL"}')
) as v(id, tyre)
where c.id = v.id;

-- The M4 CS runs forged 19" / 20" wheels (the row was copied from the M4 Competition's 20" / 21").
update public.cars
set recommended_wheel_fitment = recommended_wheel_fitment || '{"front":"19 x 9.5J","rear":"20 x 10.5J"}'::jsonb
where id = 'm4_cs_g82';
