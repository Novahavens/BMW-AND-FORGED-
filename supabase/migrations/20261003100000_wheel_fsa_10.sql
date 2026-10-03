-- FSA-10: gold fifteen-spoke, five lug. Added HIDDEN (active = false) until the 3D face passes QA.
-- Name and prices are placeholders (prices copied from FSA-03); rim image is served from the app's
-- own public/rim-images folder (relative URL), cut out from a 512 px source.
insert into public.wheels (id, code, name, subtitle, style, spoke_type, spoke_count, standard_sizes, price_per_set, price_by_size,
  description, highlights, available_variants, default_variant, image_url, image_extrude, sort_order, active)
values ('forged_fsa_10', 'FSA-10', 'Multi Spoke Gold', 'Fifteen-spoke satin gold', 'Monoblock Forged', 'multi', 15,
  array['19"','20"','21"','22"'], 3736.26,
  '{"19\"":3736.26,"20\"":4065.93,"21\"":4505.49,"22\"":5054.95}'::jsonb,
  'Fifteen slim, evenly spaced spokes run from a five-lug hub to a deep outer lip, finished in satin gold.',
  array['Fifteen-spoke face','Five-lug hub','Satin gold finish'],
  array['satin_gold','liquid_metal','bronze','black','silver'], 'satin_gold',
  '/rim-images/forged_fsa_10.png', true, 10, false)
on conflict (id) do nothing;
