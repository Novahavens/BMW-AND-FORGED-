-- forged_fsa002: 3D rim fsa002.glb packed by scripts/ingest-rim.mjs on 2026-11-10.
-- Served from the repo at /models/rims/forged_fsa002.glb; on the car it replaces the wheel's photo face (the rim page keeps its spin).
-- New wheel with PLACEHOLDER copy; set the real name, sizes, prices and description in /admin.
insert into public.wheels (id, code, name, subtitle, style, spoke_type, spoke_count, standard_sizes, price_per_set, price_by_size,
  description, highlights, available_variants, default_variant, image_url, image_extrude, model_url, model_flip, active)
values ('forged_fsa002', 'FSA002', 'FSA002', 'Fifteen-spoke monoblock', 'Monoblock Forged', 'multi', 15,
  array['20"', '21"']::text[], 4120, '{"20\"":4120,"21\"":4490}'::jsonb,
  'PLACEHOLDER description: set the real copy in /admin.', '{}'::text[], array['satin_gold', 'gunmetal', 'silver']::text[], 'satin_gold', '/rim-images/forged_fsa002.webp', false, '/models/rims/forged_fsa002.glb', false, true)
on conflict (id) do update set model_url = excluded.model_url, model_flip = excluded.model_flip, image_url = coalesce(public.wheels.image_url, excluded.image_url),
  image_extrude = false, active = true, updated_at = now();
