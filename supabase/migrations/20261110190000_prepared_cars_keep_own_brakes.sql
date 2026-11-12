-- The four prepared cars keep their own brake discs, calipers (with the M badge) and tyres, as the
-- owner's viewer does. Only the stock rim is hidden, by material name (Wheel_Rim): the sheet rim is
-- fitted in its place. The engine (CarConfiguratorEngine) draws its own tyre, disc and caliper only
-- where the car has none, or where the chosen size is not the car's factory fitment.
-- Mirrored in data/configuratorData.ts (hideMeshMatch of the four prepared cars).
update public.cars
set hide_mesh_match = '(^|[^a-z])rim($|[^a-z])', updated_at = now()
where id in ('m2_g87', 'm4_cs_g82', 'm5_g90', 'm5_touring_g99');
