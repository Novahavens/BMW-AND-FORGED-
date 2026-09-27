-- BMW M4 Competition: the exported GLB splits the painted body across three materials
-- (zx1mtl for the front hood/roof/doors, body151mtl for the rear quarter panel/rocker, and
-- pillars1mtl for most of the rear valance/wide-body flares, despite its "pillars" name).
-- The paint match only covered zx1mtl, so the rest stayed in their original baked grey/black
-- texture, giving the car a two-tone, "mixed panels" look. Widen the match to cover all three.

update public.cars set paint_mesh_match = 'zx1mtl|body151mtl|pillars1mtl' where id = 'm4_g82';
