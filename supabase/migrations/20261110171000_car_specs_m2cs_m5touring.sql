-- Specs for the two prepared cars whose rows still carried seed values (2026-11-10 sweep).
-- * m2_g87 was renamed "BMW M2 CS" (20261110131759_car_m2_g87_prepared_model.sql) but kept the standard M2's
--   power/torque/acceleration from 20260922000100_seed_catalog.sql.
-- * m5_touring_g99 had blank engine/power/torque/acceleration and an empty fitment.
-- Figures are BMW's published numbers for the M2 CS (G87, 2025: 530 PS / 390 kW, 650 Nm, 0-100 km/h 3.8 s) and the
-- M5 Touring (G99: S68 V8 plug-in hybrid, 727 PS / 535 kW, 1000 Nm, 0-100 km/h 3.6 s). OWNER TO CONFIRM; the same
-- values are in data/configuratorData.ts (bundled fallback). The M2 CS keeps the M2's 19"/20" factory fitment; the
-- M5 Touring takes the M5 G90's (same chassis family). Plain updates: safe to re-run.

update public.cars set
  engine = '3.0L S58 Twin-Turbo Inline-6',
  power = '523 HP / 530 PS',
  torque = '650 Nm (479 lb-ft)',
  acceleration = '0-100 km/h in 3.8s',
  recommended_wheel_fitment = '{"front":"19 x 9.5J ET12","rear":"20 x 10.5J ET14","pcd":"5x112","cb":"66.6mm"}'::jsonb,
  updated_at = now()
where id = 'm2_g87';

update public.cars set
  engine = '4.4L S68 Twin-Turbo V8 M Hybrid',
  power = '727 HP / 535 kW',
  torque = '1,000 Nm (738 lb-ft)',
  acceleration = '0-100 km/h in 3.6s',
  recommended_wheel_fitment = '{"front":"20 x 9.5J","rear":"21 x 10.5J","pcd":"5x112","cb":"66.6mm"}'::jsonb,
  updated_at = now()
where id = 'm5_touring_g99';
