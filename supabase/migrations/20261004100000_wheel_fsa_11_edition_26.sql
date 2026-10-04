-- FSA-11 "Edition 26" (SHGW0306, 20x8.5 ET38 5x112 CB66.6): five Y-split twin spokes. Added HIDDEN
-- (active = false). Interim face: a bar face measured from the manufacturer's front-on render
-- (public/rim-faces/forged_fsa_11.png); the Parasolid CAD will replace it as model_url once exported
-- to STEP. Only 20" is confirmed by the production order; other sizes and all prices are placeholders.
insert into public.wheels (id, code, name, subtitle, style, spoke_type, spoke_count, weight_front_kg, weight_rear_kg,
  standard_sizes, price_per_set, price_by_size, description, highlights, available_variants, default_variant,
  image_url, image_extrude, sort_order, active)
values ('forged_fsa_11', 'FSA-11', 'Edition 26', 'Y-split twin five-spoke', 'Monoblock Forged', 'y_spoke', 10, 10.3, 10.3,
  array['19"','20"','21"','22"'], 4150,
  '{"19\"":4150,"20\"":4500,"21\"":4950,"22\"":5500}'::jsonb,
  'Five slender Y-split spokes fan into ten fine tips at a deep concave lip, leaving large open windows over the brakes.',
  array['Y-split twin spokes','Deep concave face','1050 kg load rating'],
  array['liquid_metal','silver','black','gunmetal'], 'liquid_metal',
  '/rim-images/forged_fsa_11.png', true, 11, false)
on conflict (id) do nothing;
