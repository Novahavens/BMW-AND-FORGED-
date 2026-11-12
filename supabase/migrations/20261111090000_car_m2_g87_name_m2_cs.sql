-- The M2 row is the M2 CS, by name as well as by model.
--
-- 20261110131759_car_m2_g87_prepared_model.sql inserts the row as 'BMW M2 CS' / 'M2 CS G87', but its
-- ON CONFLICT clause updates only the model fields. The row already existed, so the live database kept
-- 'BMW M2 Coupe' / 'M2 G87' while the bundled catalogue (data/configuratorData.ts) and the welcome
-- carousel say 'BMW M2 CS'. Read back on 2026-11-11: name 'BMW M2 Coupe', badge 'M2 G87'.
--
-- Idempotent: running it again changes nothing but updated_at.
update public.cars
set name = 'BMW M2 CS', badge = 'M2 CS G87', updated_at = now()
where id = 'm2_g87' and (name is distinct from 'BMW M2 CS' or badge is distinct from 'M2 CS G87');
