-- Satin Gold, calibrated from the client's photo of a satin champagne-gold wheel: metallic flake
-- under a satin clear (services/wheelFinish.ts reads roughness >= 0.42 as satin metallic).
-- Offered on every wheel, after Silver.
update public.wheel_finishes set
  name = 'Satin Gold', color_name = 'Champagne Gold', hex = '#c4aa7f',
  metalness = 0.85, roughness = 0.45, clearcoat = 0.35,
  description = 'Champagne gold metallic under a soft satin clear coat.', sort_order = 4, active = true
where id = 'satin_gold';

update public.wheels set available_variants = available_variants || array['satin_gold']
where not ('satin_gold' = any(available_variants));
