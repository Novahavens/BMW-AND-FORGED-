-- The client offers four wheel finishes: Liquid Metal (chrome), Bronze Matte, Black Gloss and Silver.
-- Titanium, Frozen Gold and Rose Forged are hidden rather than deleted so saved share codes still load.

update public.wheel_finishes set
  name = 'Liquid Metal', color_name = 'Chrome', hex = '#dfe4e8',
  metalness = 1.0, roughness = 0.06, clearcoat = 1.0,
  description = 'Mirror chrome finish with deep, liquid reflections.', sort_order = 0, active = true
where id = 'liquid_metal';

update public.wheel_finishes set
  name = 'Bronze Matte', color_name = 'Matte Bronze', hex = '#8f6738',
  metalness = 0.8, roughness = 0.55, clearcoat = 0.1,
  description = 'Warm motorsport bronze with a flat, low-sheen matte finish.', sort_order = 1, active = true
where id = 'bronze';

update public.wheel_finishes set
  name = 'Black Gloss', color_name = 'Gloss Black', hex = '#141618',
  metalness = 0.7, roughness = 0.15, clearcoat = 0.95,
  description = 'Deep gloss black under a high-depth clearcoat.', sort_order = 2, active = true
where id = 'black';

insert into public.wheel_finishes (id, name, color_name, hex, metalness, roughness, clearcoat, description, badge, sort_order, active)
values ('silver', 'Silver', 'Silver', '#c3c8cd', 0.9, 0.28, 0.7, 'Classic bright silver with a soft metallic sheen.', 'Classic', 3, true)
on conflict (id) do update set
  name = excluded.name, color_name = excluded.color_name, hex = excluded.hex, metalness = excluded.metalness,
  roughness = excluded.roughness, clearcoat = excluded.clearcoat, description = excluded.description,
  sort_order = excluded.sort_order, active = true;

update public.wheel_finishes set active = false where id in ('titanium', 'champagne_gold', 'rose_gold');

update public.wheels set
  available_variants = array['liquid_metal', 'bronze', 'black', 'silver'],
  default_variant = case when default_variant in ('liquid_metal', 'bronze', 'black') then default_variant else 'silver' end;
