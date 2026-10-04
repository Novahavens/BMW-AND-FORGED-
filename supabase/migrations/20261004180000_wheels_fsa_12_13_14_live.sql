-- FSA-12 Twin-Y, FSA-13 Star 6, FSA-14 Turbine 25: approved by the owner on 2026-10-04 and live.
-- Names, sizes and prices are PLACEHOLDERS copied from FSA-05 until corrected in /admin.
-- Mirrors the bundled entries in data/configuratorData.ts. The car uses the 2D face (image_url);
-- the rim page uses the rendered 360° spin (public/renders/rims/<id>/).
insert into public.wheels (id, code, name, subtitle, style, spoke_type, spoke_count, weight_front_kg, weight_rear_kg,
  weight_savings_kg, standard_sizes, price_per_set, price_by_size, description, highlights, available_variants,
  default_variant, image_url, image_extrude, sort_order, active)
values
  ('forged_fsa_12', 'FSA-12', 'Forged SA Twin-Y', 'Polished twin-Y five-spoke', 'Monoblock Forged', 'multi', 10, 0, 0, 0,
   array['19"','20"','21"','22"'], 3736.26,
   '{"19\"":3736.26,"20\"":4065.93,"21\"":4505.49,"22\"":5054.95}'::jsonb,
   'Five pairs of slim spokes leave the hub together and open toward the lip, cut from a single forged monoblock and hand-polished.',
   array['Twin-Y five-spoke layout','True 3D rim model','Hand-polished monoblock'],
   array['liquid_metal','bronze','black','silver','satin_gold'], 'liquid_metal',
   '/rim-faces/forged_fsa_12.png', true, 15, true),
  ('forged_fsa_13', 'FSA-13', 'Forged SA Star 6', 'Brushed six-point split star', 'Two-Piece Forged', 'multi', 12, 0, 0, 0,
   array['19"','20"','21"','22"'], 3736.26,
   '{"19\"":3736.26,"20\"":4065.93,"21\"":4505.49,"22\"":5054.95}'::jsonb,
   'Six pairs of slim brushed spokes form a star around a centre-lock hub, inside a polished two-piece lip.',
   array['Six-point split star','Centre-lock hub','Polished two-piece lip'],
   array['liquid_metal','bronze','black','silver','satin_gold'], 'liquid_metal',
   '/rim-images/forged_fsa_13.png', true, 16, true),
  ('forged_fsa_14', 'FSA-14', 'Forged SA Turbine 25', 'Gloss black 25-spoke turbine', 'Monoblock Forged', 'multi', 25, 0, 0, 0,
   array['19"','20"','21"','22"'], 3736.26,
   '{"19\"":3736.26,"20\"":4065.93,"21\"":4505.49,"22\"":5054.95}'::jsonb,
   'Twenty-five swept spokes spiral out from the hub like a turbine, cut from one forged monoblock.',
   array['25 swept spokes','Directional turbine face','Forged monoblock'],
   array['liquid_metal','bronze','black','silver','satin_gold'], 'liquid_metal',
   '/rim-images/forged_fsa_14.png', true, 17, true)
on conflict (id) do nothing;
