-- The satin values from 20261112120000 (#6e4a30, rough 0.45) read as flat orange clay on the car: the
-- satin-metallic recipe has no sharp highlights. SIXNINE's Pure Bronze shows a soft sheen on the spoke edges,
-- which the metallic-paint recipe (rough < 0.42) gives. Chosen from side-by-side renders on the M2 CS.
update public.wheel_finishes
   set hex = '#75523f', metalness = 0.9, roughness = 0.3, clearcoat = 0.7,
       description = 'Deep bronze metallic with a soft sheen, the FF-3 signature finish.'
 where id = 'pure_bronze';
