-- The configurator screen now draws cars live in the vehicle spec viewer's studio. The cars whose bodies
-- are still the low-poly Sketchfab files (drawn from Blender frames over the old backdrop) are hidden until
-- their prepared packages arrive (docs/ADD_PREPARED_CAR.md: one `node scripts/ingest-car.mjs` per package).
-- Rows, files and frames stay; set active = true to bring a car back.
update public.cars set active = false, updated_at = now()
where id in ('m4_g82', 'm4_convertible_g83', 'm3_g80', 'm3_touring_g81', 'm235_f74', 'm8_f92', 'x3m50_g45', 'x5m_f95');
-- The prepared cars lead the showroom.
update public.cars set sort_order = v.o, updated_at = now()
from (values ('m2_g87', 0), ('m4_cs_g82', 1), ('m5_g90', 2), ('m5_touring_g99', 3)) as v(id, o)
where public.cars.id = v.id;
