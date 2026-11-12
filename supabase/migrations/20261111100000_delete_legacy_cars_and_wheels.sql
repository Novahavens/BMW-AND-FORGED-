-- Owner's instruction (2026-11-11): delete the legacy cars and wheels; only the four prepared cars
-- (m2_g87, m4_cs_g82, m5_g90, m5_touring_g99) and the six stock-sheet wheels stay.
-- Already applied to the live project (as "delete_legacy_cars_and_wheels"); kept here so a rebuilt database matches.
-- The rows are archived first in a private schema (not exposed by the API) so a restore is one insert ... select:
--   insert into public.cars select * from archive.legacy_cars;
--   insert into public.wheels select * from archive.legacy_wheels;
create schema if not exists archive;

create table if not exists archive.legacy_cars as
  select * from public.cars
  where id in ('m235_f74','m3_g80','m3_touring_g81','m4_convertible_g83','m4_g82','m5_f90','m8_f92','x3m50_g45','x5m_f95');

create table if not exists archive.legacy_wheels as
  select * from public.wheels
  where id in ('forged_fsa_01','forged_fsa_02','forged_fsa_04','forged_fsa_05','forged_fsa_06','forged_fsa_07','forged_fsa_08','forged_fsa_09','forged_fsa_10','forged_fsa_11','forged_fsa_12','forged_fsa_13','forged_fsa_14');

-- never reachable through the public API
revoke all on schema archive from anon, authenticated;
revoke all on all tables in schema archive from anon, authenticated;

-- only after the archive holds the full set
do $$
begin
  if (select count(*) from archive.legacy_cars) <> 9 or (select count(*) from archive.legacy_wheels) <> 13 then
    raise exception 'archive incomplete: cars %, wheels %', (select count(*) from archive.legacy_cars), (select count(*) from archive.legacy_wheels);
  end if;
end $$;

delete from public.cars where id in (select id from archive.legacy_cars) and not active;
delete from public.wheels where id in (select id from archive.legacy_wheels) and not active;
