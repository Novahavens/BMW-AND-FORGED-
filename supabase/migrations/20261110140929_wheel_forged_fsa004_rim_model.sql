-- forged_fsa004: 3D rim fsa004.glb packed by scripts/ingest-rim.mjs on 2026-11-10.
-- Served from the repo at /models/rims/forged_fsa004.glb; on the car it replaces the wheel's photo face (the rim page keeps its spin).
-- New wheel with PLACEHOLDER copy; set the real name, sizes, prices and description in /admin.
insert into public.wheels (id, code, name, subtitle, style, spoke_type, spoke_count, standard_sizes, price_per_set, price_by_size,
  description, highlights, available_variants, default_variant, image_url, image_extrude, model_url, model_flip, active)
values ('forged_fsa004', 'FSA004', 'FSA004', 'Twelve-spoke monoblock', 'Monoblock Forged', 'multi', 12,
  array['20"', '21"']::text[], 3850, '{"20\"":3850,"21\"":4200}'::jsonb,
  'PLACEHOLDER description: set the real copy in /admin.', '{}'::text[], array['silver', 'gunmetal', 'black']::text[], 'silver', '/rim-images/forged_fsa004.webp', false, '/models/rims/forged_fsa004.glb', false, true)
on conflict (id) do update set model_url = excluded.model_url, model_flip = excluded.model_flip, image_url = coalesce(public.wheels.image_url, excluded.image_url),
  image_extrude = false, active = true, updated_at = now();
