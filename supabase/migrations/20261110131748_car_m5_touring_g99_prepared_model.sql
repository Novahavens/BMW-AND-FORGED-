-- BMW M5 Touring: prepared model from BMW_M5_Touring_G99.zip, ingested by scripts/ingest-car.mjs on 2026-11-10.
-- The file is served from the repo at /models/m5_touring_g99.glb. Licence: see public/models/CREDITS.md (not confirmed for the
-- prepared packages; prototype use until a licence is in hand).
insert into public.cars (id, name, badge, generation, chassis_code, body_style, model_url, model_rotation_deg, model_length_m,
  paint_mesh_match, hide_mesh_match, active)
values ('m5_touring_g99', 'BMW M5 Touring', 'M5 Touring G99', 'G99', 'G99 M5 Touring',
  'touring', '/models/m5_touring_g99.glb', 0, 5.09, '(^|[^a-z])paint($|[^a-z])', '(^|[^a-z])(wheel|rim|tyre|tire|brake|caliper|calliper|rotor|lugs?)', true)
on conflict (id) do update set
  model_url = excluded.model_url, model_rotation_deg = excluded.model_rotation_deg, model_length_m = excluded.model_length_m,
  paint_mesh_match = excluded.paint_mesh_match, hide_mesh_match = excluded.hide_mesh_match, active = true, updated_at = now();
