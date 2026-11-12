-- Owner's call (2026-11-12): the finish is "Gloss Black", as on the stock sheet (was "Black Gloss"), and Pure
-- Bronze is SIXNINE's satin chocolate bronze, not a bright gloss copper. #6e4a30 at roughness 0.45 reads as the
-- satin-metallic recipe in services/wheelFinish.ts (soft highlights, strong flop), chosen against the FF-3 photo.
update public.wheel_finishes
   set name = 'Gloss Black'
 where id = 'black';

update public.wheel_finishes
   set color_name = 'Satin Bronze',
       hex = '#6e4a30', metalness = 0.85, roughness = 0.45, clearcoat = 0.3,
       description = 'Deep satin bronze metallic with a soft sheen, the FF-3 signature finish.'
 where id = 'pure_bronze';

update public.wheels
   set description = replace(description, 'Glossy Black', 'Gloss Black'),
       highlights = array(select replace(h, 'Glossy Black', 'Gloss Black') from unnest(highlights) as h)
 where id = 'sixnine_ff3';
