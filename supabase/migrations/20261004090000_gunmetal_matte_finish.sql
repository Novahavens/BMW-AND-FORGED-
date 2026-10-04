-- Gunmetal Matte: the matte gunmetal FORGED SA manufactures (production order FW202604041).
-- Roughness >= 0.42 with metalness >= 0.3 reads as satin metallic in services/wheelFinish.ts.
insert into public.wheel_finishes (id, name, color_name, hex, metalness, roughness, clearcoat, description, badge, sort_order, active)
values ('gunmetal', 'Gunmetal Matte', 'Matte Gunmetal', '#4a4d52', 0.85, 0.5, 0.2,
        'Dark satin gunmetal metallic with a soft, low-sheen finish.', 'New', 5, true)
on conflict (id) do update set name = excluded.name, color_name = excluded.color_name, hex = excluded.hex,
  metalness = excluded.metalness, roughness = excluded.roughness, clearcoat = excluded.clearcoat,
  description = excluded.description, badge = excluded.badge, sort_order = excluded.sort_order, active = excluded.active;
