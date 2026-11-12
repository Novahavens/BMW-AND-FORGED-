-- BMW M4 CS: prepared model from BMW_M4_CS_G82.zip, ingested by scripts/ingest-car.mjs on 2026-11-10.
-- The file is served from the repo at /models/m4_cs_g82.glb. Licence: see public/models/CREDITS.md (not confirmed for the
-- prepared packages; prototype use until a licence is in hand).
insert into public.cars (id, name, badge, generation, chassis_code, body_style, model_url, model_rotation_deg, model_length_m,
  paint_mesh_match, hide_mesh_match, active)
values ('m4_cs_g82', 'BMW M4 CS', 'M4 CS G82', 'G82', 'G82 M4 CS',
  'coupe', '/models/m4_cs_g82.glb', 0, 4.79, '(^|[^a-z])paint($|[^a-z])', '(^|[^a-z])(wheel|rim|tyre|tire|brake|caliper|calliper|rotor|lugs?)', true)
on conflict (id) do update set
  model_url = excluded.model_url, model_rotation_deg = excluded.model_rotation_deg, model_length_m = excluded.model_length_m,
  paint_mesh_match = excluded.paint_mesh_match, hide_mesh_match = excluded.hide_mesh_match, active = true, updated_at = now();
