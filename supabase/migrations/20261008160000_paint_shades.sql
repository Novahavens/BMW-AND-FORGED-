-- Paint shades checked against photos (scratchpad research, 2026-10-08):
-- Ruby Star P9L is a solid paint ("Sternrubin Uni") in hot pink, not a purple metallic; BMW Welt photos put the
-- body mid-tone around #d90867-#e11c75. Velvet Orchid II L74 was a pale lilac matching only the highlights;
-- BMW press and BMWBlog photos put lit panels at #8c7285-#986f7a. Mirrors data/configuratorData.ts.
update public.paints set hex = '#cf1272', type = 'Uni', roughness = 0.5, metalness = 0.0, clearcoat = 1.0, clearcoat_roughness = 0.05 where id = 'ruby_star';
update public.paints set hex = '#8e7183' where id = 'velvet_orchid_ii';
