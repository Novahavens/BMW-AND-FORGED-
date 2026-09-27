-- 1. X5 M Competition: the facelift (F95 LCI) body built by scripts/build-x5m-lci.mjs from
--    "BMW X5M F95 + Facelifted Versions" by ZapupaNekra (CC BY 4.0), replacing the pre-facelift file.
update public.cars set
  model_url = '/models/bmw-x5m-f95-lci.glb',
  model_rotation_deg = 0,
  model_length_m = 4.94,
  paint_mesh_match = 'x5m_paint',
  hide_mesh_match = '^wheel_'
where id = 'x5m_f95';

-- 2. Paint that reads like BMW's studio renders instead of plastic: a more metallic, softer base layer
--    (the broad sheen takes the paint colour, not white) under a crisp clearcoat. The engine also lowers
--    the body's environment reflection (CarConfiguratorEngine.BODY_ENV_INTENSITY).
update public.paints set metalness = 0.8, roughness = 0.45, clearcoat = 1.0, clearcoat_roughness = 0.05 where type = 'Metallic';
update public.paints set metalness = 0.0, roughness = 0.5, clearcoat = 1.0, clearcoat_roughness = 0.05 where type = 'Uni';
