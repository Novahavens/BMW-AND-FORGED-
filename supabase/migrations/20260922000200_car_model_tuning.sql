-- Per-car knobs for fitting an uploaded GLB into the studio scene.
alter table public.cars
  add column model_rotation_deg real not null default 0,
  add column model_length_m real not null default 4.7,
  add column paint_mesh_match text not null default 'paint|body|carpaint|exterior',
  add column hide_mesh_match text not null default 'wheel|rim|tyre|tire|brake|caliper|rotor';

update public.cars set model_length_m = case id
  when 'm4_g82' then 4.79
  when 'm3_g80' then 4.79
  when 'm2_g87' then 4.58
  when 'm5_f90' then 4.98
  else model_length_m end;
