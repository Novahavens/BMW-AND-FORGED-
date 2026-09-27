-- Real 3D bodies for the factory-paint catalogue (see public/models/CREDITS.md).
--
-- * m5_g90 moves from the non-commercial Ddiaz Design file (bmw-m5-g90.glb, CC BY-NC-SA, now deleted)
--   to the CC BY JUSTGAME model, whose body panels were given their own 'm5g90_body_paint' material.
-- * m4_convertible_g83 and m5_touring_g99 keep the procedural placeholder body (model_url null):
--   no commercial-licence G83 / G99 model exists yet.
-- * paint_mesh_match / hide_mesh_match are case-insensitive regexes tested against each mesh's
--   "<mesh name> <material name>" (CarConfiguratorEngine). model_rotation_deg turns a GLB that was
--   exported facing the other way; model_length_m scales it to the real car's length.

update public.cars c set
  model_url = v.model_url,
  model_rotation_deg = v.model_rotation_deg,
  model_length_m = v.model_length_m,
  paint_mesh_match = v.paint_mesh_match,
  hide_mesh_match = v.hide_mesh_match
from (values
  ('m2_g87', '/models/bmw-m2-competition.glb', 0, 4.58, 'm2g87undg_paint', '(^|[^a-z])(rimslaw|tire_01|calliper|caliper|brakedisc|rotor)'),
  ('m3_g80', '/models/bmw-m3-competition.glb', 180, 4.79, 'merged_materials', '(^|[^a-z])(wheelcolor1mtl|lugs1mtl|calliperpaintrl1mtl|union2mtl|stem1mtl|tyre1mtl)'),
  ('m3_touring_g81', '/models/bmw-m3-touring-g81.glb', 0, 4.80, '(^|\s)m3g81law$', 'rim_04|3_wheel|amdb11'),
  ('m4_g82', '/models/bmw-m4-competition.glb', 0, 4.79, 'zx1mtl|body151mtl|pillars1mtl|livery1mtl', '(^|[^a-z])(wheel|rim|tyre|tire|brake|caliper|rotor)'),
  ('m5_g90', '/models/bmw-m5-g90-cc-by.glb', 0, 5.10, 'm5g90_body_paint', '(^|[^a-z])(wheel|rim|tyre|tire|brake|caliper|calliper|rotor|lugs?)'),
  ('m8_f92', '/models/bmw-m8-competition-f92.glb', 0, 4.87, 'carpaint', 'm8f92_(wheel|caliper|brakedisc)'),
  ('m235_f74', '/models/bmw-m235-gran-coupe.glb', 180, 4.54, '(^|\s)paint$', 'wheel_lf'),
  ('x3m50_g45', '/models/bmw-x3-m50-g45.glb', 180, 4.76, 'paint_|^object_86\s', 'wheel_'),
  ('x5m_f95', '/models/bmw-x5m-f95.glb', 0, 4.94, 'marina_bay', '(^|[^a-z])(wheel|rim|tyre|tire|brake|caliper|calliper|rotor|lugs?)|csb_paint1mtl'),
  ('m4_convertible_g83', null, 0, 4.79, 'paint|body|carpaint|exterior', 'wheel|rim|tyre|tire|brake|caliper|rotor'),
  ('m5_touring_g99', null, 0, 5.10, 'paint|body|carpaint|exterior', 'wheel|rim|tyre|tire|brake|caliper|rotor')
) as v(id, model_url, model_rotation_deg, model_length_m, paint_mesh_match, hide_mesh_match)
where c.id = v.id;
