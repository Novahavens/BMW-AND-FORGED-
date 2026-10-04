-- Car model fixes found in the shared-texture pass (mirrored in data/configuratorData.ts).
-- NOT yet applied: run it after the app version carrying this change is deployed.
--
-- M3 Competition (bmw-m3-competition.glb): the bonnet centre panel is a separate part with its own
-- material, Hoodpainttextured1Mtl, baked in Isle of Man green. "merged_materials" alone missed it,
-- so it kept the green under every other paint. It now takes the paint like the rest of the body.
update public.cars
   set paint_mesh_match = 'merged_materials|hoodpainttextured1mtl'
 where id = 'm3_g80' and paint_mesh_match = 'merged_materials';

-- M8 Competition (bmw-m8-competition-f92.glb): the file spells its caliper materials "Calliper"
-- (m8f92_Calliper_Color, m8f92_CalliperBadge). They are hidden today only because their node names
-- use "Caliper"; match both spellings so the model's calipers stay hidden whatever the names say.
update public.cars
   set hide_mesh_match = 'm8f92_(wheel|cal?liper|brakedisc)'
 where id = 'm8_f92' and hide_mesh_match = 'm8f92_(wheel|caliper|brakedisc)';
