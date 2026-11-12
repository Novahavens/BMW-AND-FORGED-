-- sixnine_ff1: 3D rim ff-1.glb packed by scripts/ingest-rim.mjs on 2026-11-10.
-- Served from the repo at /models/rims/sixnine_ff1.glb; on the car it replaces the wheel's photo face (the rim page keeps its spin).
-- New wheel with PLACEHOLDER copy; set the real name, sizes, prices and description in /admin.
insert into public.wheels (id, code, name, subtitle, style, spoke_type, spoke_count, standard_sizes, price_per_set, price_by_size,
  description, highlights, available_variants, default_variant, image_url, image_extrude, model_url, model_flip, active)
values ('sixnine_ff1', 'FF-1', 'SIXNINE FF-1', 'Split five-spoke, two-piece', 'Two-Piece Forged', 'multi', 10,
  array['20"', '21"']::text[], 4400, '{"20\"":4400,"21\"":4800}'::jsonb,
  'PLACEHOLDER description: set the real copy in /admin.', '{}'::text[], array['silver', 'liquid_metal']::text[], 'silver', '/rim-images/sixnine_ff1.webp', false, '/models/rims/sixnine_ff1.glb', false, true)
on conflict (id) do update set model_url = excluded.model_url, model_flip = excluded.model_flip, image_url = coalesce(public.wheels.image_url, excluded.image_url),
  image_extrude = false, active = true, updated_at = now();
