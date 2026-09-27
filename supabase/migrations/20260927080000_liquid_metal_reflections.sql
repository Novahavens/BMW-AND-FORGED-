-- Liquid Metal at roughness 0.06 behaved as a perfect mirror: in a wheel arch it reflects the dark car
-- body and ground, so every rim face rendered near black. 0.12 keeps the chrome look but stays bright.
update public.wheel_finishes set metalness = 0.98, roughness = 0.12 where id = 'liquid_metal';
