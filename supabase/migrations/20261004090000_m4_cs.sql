-- BMW M4 CS as its own car (model: "2025 BMW M4 CS VR46 Edition" by BMW'S Lost Proxy, CC BY 4.0,
-- see public/models/CREDITS.md). Palette, wheel fitment and engine come from the M4 Competition row.
-- The model's own wheels are hidden and replaced by ours; its own calipers are kept (not in hide_mesh_match)
-- and recoloured by the configurator.
-- Applied 2026-10-07 (with the CS palette: riviera_blue, frozen_isle_of_man_green, brooklyn_grey, black_sapphire).

insert into public.cars (id, name, badge, generation, chassis_code, engine, power, torque, acceleration,
  recommended_wheel_fitment, body_style, model_url, model_rotation_deg, model_length_m,
  paint_mesh_match, hide_mesh_match, paint_ids, sort_order, active)
select 'm4_cs_g82', 'BMW M4 CS', 'M4 CS G82', generation, 'G82 M4 CS', engine, '543 HP / 550 PS', torque,
  '0-100 km/h in 3.4s', recommended_wheel_fitment, body_style, '/models/bmw-m4-cs-vr46.glb', 0, 4.79,
  'm4car_body1|m4car_hood1|m4car_bodykit1|m4car_spoiler1', 'wheel1a|phong11|phong23', paint_ids, 1, true
from public.cars where id = 'm4_g82'
on conflict (id) do update set
  model_url = excluded.model_url, model_length_m = excluded.model_length_m,
  paint_mesh_match = excluded.paint_mesh_match, hide_mesh_match = excluded.hide_mesh_match,
  active = true;
