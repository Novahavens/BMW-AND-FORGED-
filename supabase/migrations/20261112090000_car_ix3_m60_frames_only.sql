-- BMW iX3 M60 (NA5), the first frames-only car: a Blendkit Royalty Free model, which may reach the site only as
-- pre-rendered images, so model_url stays NULL and the browser never downloads its GLB. The body is the Cycles frames in
-- public/renders/ix3_m60 and the wheel layout is in public/renders/manifest.json (docs/ADD_PREPARED_CAR.md,
-- "Frames-only cars"). Mirrors data/configuratorData.ts.
-- Figures: BMW Group press release of 8 Oct 2026 (provisional): 450 kW / 612 hp, 875 Nm, 0-100 km/h 3.9 s, 21-inch M
-- wheels standard. Rim width/offset are not published: 21 x 9J is the 21-inch iX3 fitment in the tyre guides. OWNER TO
-- CONFIRM the figures and the paint list (taken from the existing palette).
-- paint_mesh_match / hide_mesh_match are unused for a car without a GLB; set to their defaults. Safe to re-run.

insert into public.cars (id, name, badge, generation, chassis_code, engine, power, torque, acceleration,
  recommended_wheel_fitment, body_style, model_url, sort_order, active, model_rotation_deg, model_length_m, paint_ids)
values ('ix3_m60', 'BMW iX3 M60', 'iX3 M60 xDrive', 'NA5', 'NA5 iX3 M60', 'Dual-motor electric (one per axle)',
  '612 HP / 450 kW', '875 Nm (645 lb-ft)', '0-100 km/h in 3.9s',
  '{"front":"21 x 9J","rear":"21 x 9J","pcd":"5x112","cb":"66.6mm"}'::jsonb, 'suv', null, 4, true, 0, 4.79,
  array['alpine_white','mineral_white','black_sapphire','carbon_black','brooklyn_grey','fire_red','storm_bay','frozen_deep_grey_c64'])
on conflict (id) do update set
  name = excluded.name, badge = excluded.badge, generation = excluded.generation, chassis_code = excluded.chassis_code,
  engine = excluded.engine, power = excluded.power, torque = excluded.torque, acceleration = excluded.acceleration,
  recommended_wheel_fitment = excluded.recommended_wheel_fitment, body_style = excluded.body_style,
  model_url = null, model_length_m = excluded.model_length_m, paint_ids = excluded.paint_ids, active = true,
  updated_at = now();
