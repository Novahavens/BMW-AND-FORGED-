-- Satin Gold: champagne-gold metallic paint under a gloss clear coat (reads as metallic paint in
-- services/wheelFinish.ts: metalness >= 0.3, roughness < 0.42). Not ticked on any wheel yet.
insert into public.wheel_finishes (id, name, color_name, hex, metalness, roughness, clearcoat, description, badge, sort_order, active)
values ('satin_gold', 'Satin Gold', 'Champagne Gold', '#C5A059', 0.9, 0.3, 0.85,
        'Soft champagne gold metallic with a smooth satin-gloss sheen.', 'New', 4, true)
on conflict (id) do update set name = excluded.name, color_name = excluded.color_name, hex = excluded.hex,
  metalness = excluded.metalness, roughness = excluded.roughness, clearcoat = excluded.clearcoat,
  description = excluded.description, badge = excluded.badge, sort_order = excluded.sort_order, active = excluded.active;
