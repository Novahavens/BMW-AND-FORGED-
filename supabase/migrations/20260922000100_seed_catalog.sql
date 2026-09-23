-- Seed catalogue from data/configuratorData.ts (idempotent).
insert into public.cars (id, name, badge, generation, chassis_code, engine, power, torque, acceleration, recommended_wheel_fitment, body_style, sort_order) values
  ('m4_g82', 'BMW M4 Competition', 'M4 G82', 'G82', 'G82 M4', '3.0L S58 Twin-Turbo Inline-6', '503 HP / 510 PS', '650 Nm (479 lb-ft)', '0-100 km/h in 3.5s', '{"front":"20 x 9.5J ET15","rear":"21 x 10.5J ET18","pcd":"5x112","cb":"66.6mm"}'::jsonb, 'coupe', 0),
  ('m3_g80', 'BMW M3 Competition', 'M3 G80', 'G80', 'G80 M3', '3.0L S58 Twin-Turbo Inline-6', '503 HP / 510 PS', '650 Nm (479 lb-ft)', '0-100 km/h in 3.5s', '{"front":"19 x 9.5J ET14","rear":"20 x 10.5J ET16","pcd":"5x112","cb":"66.6mm"}'::jsonb, 'sedan', 1),
  ('m2_g87', 'BMW M2 Coupe', 'M2 G87', 'G87', 'G87 M2', '3.0L S58 Twin-Turbo Inline-6', '453 HP / 460 PS', '550 Nm (406 lb-ft)', '0-100 km/h in 3.9s', '{"front":"19 x 9.5J ET12","rear":"20 x 10.5J ET14","pcd":"5x112","cb":"66.6mm"}'::jsonb, 'coupe', 2),
  ('m5_f90', 'BMW M5 CS', 'M5 F90 CS', 'F90', 'F90 M5', '4.4L S63 Twin-Turbo V8', '627 HP / 635 PS', '750 Nm (553 lb-ft)', '0-100 km/h in 3.0s', '{"front":"20 x 9.5J ET20","rear":"20 x 10.5J ET24","pcd":"5x112","cb":"66.6mm"}'::jsonb, 'sedan', 3)
on conflict (id) do nothing;

insert into public.paints (id, name, code, hex, type, roughness, metalness, clearcoat, clearcoat_roughness, sort_order) values
  ('isle_of_man_green', 'Isle of Man Green', 'C4G', '#0d4332', 'Metallic', 0.18, 0.72, 0.95, 0.08, 0),
  ('brooklyn_grey', 'Brooklyn Grey', 'C4P', '#7e8388', 'Metallic', 0.28, 0.45, 0.9, 0.1, 1),
  ('frozen_deep_grey', 'Frozen Deep Grey', 'P7X', '#2d3135', 'Frozen', 0.58, 0.35, 0.25, 0.45, 2),
  ('black_sapphire', 'Black Sapphire', '475', '#101214', 'Metallic', 0.14, 0.85, 0.98, 0.04, 3),
  ('marina_bay_blue', 'Marina Bay Blue', 'C1K', '#0b3c85', 'Metallic', 0.16, 0.78, 0.95, 0.06, 4),
  ('sao_paulo_yellow', 'São Paulo Yellow', 'C4H', '#b4cf17', 'Uni', 0.22, 0.2, 0.9, 0.08, 5),
  ('toronto_red', 'Toronto Red', 'C3G', '#a3171e', 'Metallic', 0.17, 0.65, 0.95, 0.06, 6),
  ('alpine_white', 'Alpine White', '300', '#eceeed', 'Uni', 0.2, 0.15, 0.9, 0.1, 7)
on conflict (id) do nothing;

insert into public.wheel_finishes (id, name, color_name, hex, metalness, roughness, clearcoat, description, badge, sort_order) values
  ('liquid_metal', 'Liquid Metal', 'Hyper-Reflective Mirror Silver', '#d6dde3', 0.98, 0.12, 1, 'Triple-plated high-vacuum liquid chrome finish delivering mirror-like reflections and high-speed optical sheen.', 'Signature', 0),
  ('bronze', 'Satin Bronze', 'Motorsport Matte Bronze', '#8f6738', 0.88, 0.38, 0.5, 'Warm brushed endurance racing bronze with a matte frosted topcoat that resists extreme track brake dust.', 'Popular', 1),
  ('black', 'Gloss Black', 'Phantom Piano Black', '#141618', 0.7, 0.15, 0.95, 'Deep obsidian black with high-depth clearcoat gloss, highlighting the raw machined geometric spoke edges.', 'Classic', 2),
  ('titanium', 'Brushed Titanium', 'Directional Machine Raw Titanium', '#9aa0a6', 0.92, 0.24, 0.85, 'Hand-brushed radial directional lines beneath a smoke-tinted aerospace clearcoat.', 'Artisan', 3),
  ('champagne_gold', 'Frozen Gold', 'Heritage CSL Champagne Gold', '#bda165', 0.85, 0.32, 0.6, 'Inspired by BMW M Motorsport works cars; soft champagne gold with a delicate satin metallic flake.', 'Heritage', 4),
  ('rose_gold', 'Rose Forged', 'Bespoke Copper Rose Metallic', '#9e625a', 0.9, 0.25, 0.8, 'Exotic bespoke alloy treatment infusing warm copper and rose hues under dynamic sunlight.', 'Limited', 5)
on conflict (id) do nothing;

insert into public.wheels (id, code, name, subtitle, style, spoke_type, spoke_count, weight_front_kg, weight_rear_kg, weight_savings_kg, standard_sizes, price_per_set, description, highlights, available_variants, default_variant, sort_order) values
  ('fw_01_monoblock_gt3', 'FW-01 GT3', 'Apex Monoblock GT3', 'Ultra-Lightweight 9-Spoke Forged Magnesium', 'Monoblock 9-Spoke', 'multi', 9, 7.8, 8.3, 4.8, array['19"', '20"', '21"']::text[], 7800, 'Forged from a single solid billet of 6061-T6 magnesium-aluminum aerospace alloy with hollow pocket spoke milling to cut unsprung rotational mass by up to 19.2 kg across all 4 corners.', array['7.8 kg front wheel mass', 'I-Beam spoke cross-section for maximum lateral stiffness', 'Engineered for BMW M Carbon Ceramic Brakes clearance', 'Knurled bead seats to prevent tire slippage during launch control']::text[], array['liquid_metal', 'bronze', 'black', 'titanium', 'champagne_gold']::text[], 'liquid_metal', 0),
  ('fw_02_aerodisc_gt', 'FW-02 AERO', 'AeroDisc Forged Motorsport', 'Split 5-Spoke with Forged Carbon Turbofan Ring', 'Aero Turbofan Split 5', 'aerodisc', 10, 8.2, 8.7, 4.1, array['20"', '21"']::text[], 8600, 'Directly derived from endurance GT3 racecars. Features functional aero evacuation channels that actively draw cooling air through the brake caliper assembly at speeds over 120 km/h.', array['Bespoke carbon fiber turbofan extraction ring', 'Reduces front axle aerodynamic drag by 4.2%', 'Direct OE BMW center cap compatible or centerlock nut look', 'High-load rated for track attack days']::text[], array['bronze', 'liquid_metal', 'black', 'titanium']::text[], 'bronze', 1),
  ('fw_03_csl_yspoke', 'FW-03 CSL', 'Competition CSL Y-Spoke', 'Deep Concave Heritage Lightweight Y-Pattern', 'Deep Concave Y-Spoke', 'y_spoke', 10, 7.6, 8.1, 5.2, array['19"', '20"', '21"']::text[], 7400, 'A homage to legendary BMW M heritage wheels re-imagined with extreme deep concave rear profile and thin, chiseled spoke faces that accentuate aggressive BMW M wheel arches.', array['Extreme 85mm deep concave rear wheel drop', 'Featherweight 7.6 kg per front wheel', 'Optically extends to the outermost lip edge for a larger appearance', 'Tested under 10,000,000 cycle dynamic cornering fatigue loads']::text[], array['liquid_metal', 'bronze', 'black', 'champagne_gold', 'titanium']::text[], 'champagne_gold', 2),
  ('fw_04_twin_turbine', 'FW-04 TURBO', 'Vortex Directional Turbine', 'Asymmetric Directional Multi-Blade Forged', 'Directional 10-Spoke', 'directional', 10, 8, 8.5, 4.4, array['20"', '21"']::text[], 8200, 'Left and right vehicle side dedicated directional blade profiles. Machined with complex 5-axis CNC passes to sculpt a sculptural turbine vortex effect that rotates forward on both sides.', array['Left/Right dedicated side asymmetric tooling', '5-Axis CNC machined undercut spoke side cavities', 'Optimal airflow extraction over brake discs', 'Ultra-deep lip barrel with laser-engraved serial number']::text[], array['liquid_metal', 'black', 'bronze', 'titanium', 'rose_gold']::text[], 'black', 3),
  ('fw_05_dtm_multispoke', 'FW-05 DTM', 'DTM Racing Multi-Spoke', '15-Spoke High-Density Magnesium Monoblock', '15-Spoke DTM Grid', 'mesh', 15, 7.9, 8.4, 4.7, array['19"', '20"']::text[], 7600, 'Inspired by European touring car championships. Provides uniform stress distribution across 15 radiating spokes, allowing paper-thin walls and remarkable structural rigidity.', array['Maximum structural rigidity for curb striking on race tracks', 'Center-lock aesthetics with security hex locknut cover', 'Signature BMW M tricolor engraved emblem slot', 'Supports extreme 305-width rear track slicks']::text[], array['liquid_metal', 'bronze', 'black', 'titanium']::text[], 'bronze', 4),
  ('fw_06_clubsport_deep', 'FW-06 CS', 'Clubsport 2-Piece Modular', 'Stepped Lip with Hidden Titanium Hardware', 'Modular Stepped 5-Spoke', 'clubsport', 5, 8.4, 8.9, 3.8, array['20"', '21"']::text[], 9200, 'Two-piece forged modular construction pairing a forged magnesium center face with a spun 6061-T6 aircraft aluminum stepped outer barrel joined by ARP aerospace titanium bolts.', array['Genuine 2-Piece modular architecture with 90mm stepped lip', 'Aerospace grade Grade-5 Titanium M8 assembly hardware', 'Customizable dual-tone barrel and center face finishes', 'Maximum stance and deep-dish lip presence']::text[], array['liquid_metal', 'black', 'bronze', 'titanium', 'rose_gold']::text[], 'liquid_metal', 5)
on conflict (id) do nothing;

insert into public.calipers (id, name, hex, logo, sort_order) values
  ('m_blue', 'M Performance Blue', '#0055b8', 'BMW M', 0),
  ('m_red', 'M Competition Red', '#c01824', 'BMW M', 1),
  ('carbon_gold', 'M Carbon Ceramic Gold', '#e2ab34', 'BMW Carbon Ceramic', 2),
  ('acid_green', 'Electrified Acid Green', '#7ef82a', 'BMW M Hybrid', 3),
  ('stealth_black', 'Phantom Shadow Black', '#1c1f22', 'BMW M', 4)
on conflict (id) do nothing;

