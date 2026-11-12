-- The wheel catalogue follows the owner's stock sheet (BMW M / M Performance Wheel Inventory, in stock,
-- Nov 2026; docs/WHEEL_INVENTORY.md). Six designs are offered under their real names, with the sheet's
-- sizes, finishes and ZAR prices (stored in USD at the ZA rate used by formatMoney: ZAR / 18.2). The
-- photo-traced designs that are not on the sheet stay in the table but hidden (active = false), so they
-- can be switched back on in /admin > Wheels when they are stocked again.
--
-- Mirrored in data/configuratorData.ts (WHEEL_FINISHES, WHEEL_DESIGNS).

-- 1. Two new columns: a set price per finish for the finishes that cost more (Polished Face, Liquid
--    Metal), and the rear rim file of a staggered set.
alter table public.wheels add column if not exists price_by_finish jsonb not null default '{}'::jsonb;
alter table public.wheels add column if not exists rear_model_url text;
comment on column public.wheels.price_by_finish is 'Set price (USD) per finish id for finishes dearer than the size price, e.g. {"polished_face": 4670.33}.';
comment on column public.wheels.rear_model_url is 'Staggered sets: the rear rim .glb; the front file (model_url) is used on every corner when null.';

-- 2. The finishes on the sheet. Numbers follow services/wheelFinish.ts: gold, hyper black and pure
--    bronze read as gloss metallic paint; polished face as bare polished metal; black matte as a satin
--    solid paint.
insert into public.wheel_finishes (id, name, color_name, hex, metalness, roughness, clearcoat, description, badge, sort_order, active)
values
  ('gold',          'Gold',          'Gold',               '#c9a24e', 0.9,  0.32, 0.85, 'Rich metallic gold under a gloss clear coat: bright on the spoke faces, deeper in the pockets.', 'In stock', 10, true),
  ('hyper_black',   'Hyper Black',   'Hyper Black',        '#3a3e44', 0.9,  0.24, 0.9,  'Dark hyper-black metallic: a bright flop on the spoke faces, near black where they turn away.', 'In stock', 11, true),
  ('polished_face', 'Polished Face', 'Polished Aluminium', '#e6e9ec', 1.0,  0.08, 0.6,  'Machine-polished bright aluminium face under a clear protective coat.', 'In stock', 12, true),
  ('pure_bronze',   'Pure Bronze',   'Gloss Bronze',       '#9c6b3a', 0.9,  0.3,  0.85, 'Deep gloss bronze metallic, the FF-3 signature finish.', 'In stock', 13, true),
  ('black_matte',   'Black Matte',   'Satin Black',        '#26282b', 0.0,  0.5,  0.0,  'Satin black powder coat with no gloss: the FSA001 two-piece finish.', 'In stock', 14, true)
on conflict (id) do update set
  name = excluded.name, color_name = excluded.color_name, hex = excluded.hex, metalness = excluded.metalness,
  roughness = excluded.roughness, clearcoat = excluded.clearcoat, description = excluded.description,
  badge = excluded.badge, sort_order = excluded.sort_order, active = excluded.active, updated_at = now();

-- 3. The six stocked designs. Prices: R90 000 = 4945.05, R75 000 = 4120.88, R85 000 = 4670.33,
--    R70 000 = 3846.15, R80 000 = 4395.60, R95 000 = 5219.78 (USD; ZAR / 18.2).
insert into public.wheels (id, code, name, subtitle, style, spoke_type, spoke_count, standard_sizes, price_per_set, price_by_size, price_by_finish,
  description, highlights, available_variants, default_variant, image_url, image_extrude, model_url, model_flip, rear_model_url, sort_order, active)
values
  ('forged_fsa001', 'FSA001', 'FSA001', 'Two-piece ten-spoke', 'Two-Piece Forged', 'multi', 10, array['19"', '20"'], 4945.05,
   '{"19\"": 4945.05, "20\"": 4945.05}'::jsonb, '{}'::jsonb,
   'Two-piece forged ten-spoke in Black Matte with a staggered front and rear profile. In stock for the M3 Sedan (G80): PCD 5×112 · ET8/15 · CB 66.6.',
   array['Two-piece construction', 'Staggered front and rear', 'Black Matte', 'PCD 5×112 · ET8/15 · CB 66.6'],
   array['black_matte'], 'black_matte', '/rim-images/forged_fsa001.webp', false, '/models/rims/forged_fsa001.glb', false, '/models/rims/forged_fsa001-rear.glb', 0, true),
  ('forged_fsa002', 'FSA002', 'FSA002', 'Fifteen-spoke monoblock', 'Monoblock Forged', 'multi', 15, array['20"', '21"'], 4120.88,
   '{"20\"": 4120.88, "21\"": 4120.88}'::jsonb, '{"polished_face": 4670.33}'::jsonb,
   'Fifteen-spoke forged monoblock in Gold, Hyper Black or Polished Face. In stock for the M3 Competition Sedan (G80): PCD 5×112 · ET8/15 · CB 66.6.',
   array['Forged monoblock', 'Gold, Hyper Black or Polished Face', 'PCD 5×112 · ET8/15 · CB 66.6'],
   array['gold', 'hyper_black', 'polished_face'], 'gold', '/rim-images/forged_fsa002.webp', false, '/models/rims/forged_fsa002.glb', false, null, 1, true),
  ('forged_fsa_03', 'FSA003', 'FSA003', 'Fifteen-spoke classic', 'Monoblock Forged', 'multi', 15, array['20"', '21"'], 4120.88,
   '{"20\"": 4120.88, "21\"": 4120.88}'::jsonb, '{}'::jsonb,
   'Fifteen straight, evenly spaced spokes from a five-lug hub to a slim outer lip, in Silver or Hyper Black. In stock for the M3 Sedan (G80): PCD 5×112 · ET8/15 · CB 66.6.',
   array['Fifteen straight spokes', 'Silver or Hyper Black', 'PCD 5×112 · ET8/15 · CB 66.6'],
   array['silver', 'hyper_black'], 'silver', '/rim-images/forged_fsa_03.webp', false,
   '/models/rims/forged_fsa_03.glb', false, null, 2, true),
  ('forged_fsa004', 'FSA004', 'FSA004', 'Twelve-spoke monoblock', 'Monoblock Forged', 'multi', 12, array['20"', '21"'], 3846.15,
   '{"20\"": 3846.15, "21\"": 3846.15}'::jsonb, '{}'::jsonb,
   'Twelve-spoke forged monoblock in Silver, Hyper Black or Gloss Black. In stock for the M3 Sedan and M3 Competition Sedan (G80): PCD 5×112 · ET8/15 · CB 66.6.',
   array['Forged monoblock', 'Silver, Hyper Black or Gloss Black', 'PCD 5×112 · ET8/15 · CB 66.6'],
   array['silver', 'hyper_black', 'black'], 'silver', '/rim-images/forged_fsa004.webp', false, '/models/rims/forged_fsa004.glb', false, null, 3, true),
  ('sixnine_ff1', 'FF-1', 'FF-1', 'Split five-spoke, two-piece', 'Two-Piece Forged', 'multi', 10, array['20"', '21"'], 4395.60,
   '{"20\"": 4395.60, "21\"": 4395.60}'::jsonb, '{"liquid_metal": 5219.78}'::jsonb,
   'Split five-spoke two-piece forged wheel in Silver or Liquid Metal. In stock for the M3 Sedan and M3 Competition Sedan (G80): PCD 5×112 · ET15/20 (Silver) · ET15/17 (Liquid Metal) · CB 66.6.',
   array['Two-piece construction', 'Silver or Liquid Metal', 'PCD 5×112 · ET15/20 (Silver) · ET15/17 (Liquid Metal) · CB 66.6'],
   array['silver', 'liquid_metal'], 'silver', '/rim-images/sixnine_ff1.webp', false, '/models/rims/sixnine_ff1.glb', false, null, 4, true),
  ('sixnine_ff3', 'FF-3', 'FF-3', 'Twin five-spoke, three-piece', 'Three-Piece Forged', 'multi', 10, array['20"', '21"'], 4395.60,
   '{"20\"": 4395.60, "21\"": 4395.60}'::jsonb, '{"liquid_metal": 5219.78}'::jsonb,
   'Twin five-spoke three-piece forged wheel in Pure Bronze, Glossy Black or Liquid Metal. In stock for the M3 Competition Sedan (G80): PCD 5×112 · ET15/17 · CB 66.6.',
   array['Three-piece construction', 'Pure Bronze, Glossy Black or Liquid Metal', 'PCD 5×112 · ET15/17 · CB 66.6'],
   array['pure_bronze', 'black', 'liquid_metal'], 'pure_bronze', '/rim-images/sixnine_ff3.webp', false, '/models/rims/sixnine_ff3.glb', false, null, 5, true)
on conflict (id) do update set
  code = excluded.code, name = excluded.name, subtitle = excluded.subtitle, style = excluded.style, spoke_type = excluded.spoke_type,
  spoke_count = excluded.spoke_count, standard_sizes = excluded.standard_sizes, price_per_set = excluded.price_per_set,
  price_by_size = excluded.price_by_size, price_by_finish = excluded.price_by_finish, description = excluded.description,
  highlights = excluded.highlights, available_variants = excluded.available_variants, default_variant = excluded.default_variant,
  image_url = excluded.image_url, image_extrude = excluded.image_extrude, model_url = excluded.model_url, model_flip = excluded.model_flip,
  rear_model_url = excluded.rear_model_url, sort_order = excluded.sort_order, active = excluded.active, updated_at = now();

-- 4. Everything else in the table is not on the stock sheet: hidden, not deleted.
update public.wheels set active = false, updated_at = now()
where id not in ('forged_fsa001', 'forged_fsa002', 'forged_fsa_03', 'forged_fsa004', 'sixnine_ff1', 'sixnine_ff3');

-- 5. The lead email shows the wheel price: a dearer finish now counts (same function as
--    20261001090000_lead_hardening.sql, with price_by_finish added to the price lookup). Same rule as
--    services/pricing.ts rimPrice: the finish price only ever raises the price, never lowers it, so
--    the owner's email and the customer's summary / PDF quote the same figure.
create or replace function private.notify_lead_webhook()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  hook_url text;
  cfg jsonb := coalesce(new.configuration, '{}'::jsonb);
  payload jsonb;
begin
  select decrypted_secret into hook_url from vault.decrypted_secrets where name = 'lead_webhook_url' limit 1;
  if hook_url is null or hook_url = '' then
    return new;
  end if;

  -- Flood guard: past 30 leads in 10 minutes, stop emailing (leads are still saved and listed in
  -- /admin → Enquiries), so a script can't get the Gmail sender throttled or suspended.
  if (select count(*) from public.leads l where l.created_at > now() - interval '10 minutes') > 30 then
    raise warning 'lead webhook skipped: more than 30 leads in 10 minutes';
    return new;
  end if;

  -- The lead stores display names; look the rest up so the email can show swatches, the wheel image and price.
  -- The stocked wheels have site-relative image_url values (/rim-images/*.webp), which an email client
  -- cannot resolve, so they are sent as absolute URLs on the production origin. Leads from previews or
  -- other hosts still get the production image, which is fine (same file).
  payload := jsonb_build_object(
    'id', new.id,
    'created_at', new.created_at,
    'source', new.source,
    'name', new.name,
    'email', new.email,
    'phone', new.phone,
    'message', new.message,
    'consultation', new.consultation,
    'config_code', new.config_code,
    'region', new.region,
    'size', cfg ->> 'size',
    'car', coalesce(
      (select jsonb_build_object('name', c.name, 'badge', c.badge, 'generation', c.generation)
         from public.cars c where c.id = cfg ->> 'carId' or (cfg ->> 'carId' is null and c.name = cfg ->> 'car') limit 1),
      jsonb_build_object('name', cfg ->> 'car')),
    'paint', coalesce(
      (select jsonb_build_object('name', p.name, 'code', p.code, 'hex', p.hex, 'type', p.type)
         from public.paints p where p.id = cfg ->> 'paintId' or (cfg ->> 'paintId' is null and p.name = cfg ->> 'paint')
         order by p.active desc limit 1),
      jsonb_build_object('name', cfg ->> 'paint')),
    'wheel', coalesce(
      (select jsonb_build_object('name', w.name, 'code', w.code, 'style', w.style,
                                 'image_url', case when w.image_url like '/%' then 'https://forged-configurator.vercel.app' || w.image_url else w.image_url end,
                                 'price_usd', greatest(coalesce((w.price_by_finish ->> (cfg ->> 'finishId'))::numeric, 0),
                                                       coalesce((w.price_by_size ->> (cfg ->> 'size'))::numeric, w.price_per_set)))
         from public.wheels w where w.id = cfg ->> 'wheelId' or (cfg ->> 'wheelId' is null and w.name = cfg ->> 'wheel')
         order by w.active desc limit 1),
      jsonb_build_object('name', cfg ->> 'wheel')),
    'finish', coalesce(
      (select jsonb_build_object('name', f.name, 'color_name', f.color_name, 'hex', f.hex)
         from public.wheel_finishes f where f.id = cfg ->> 'finishId' or (cfg ->> 'finishId' is null and f.name = cfg ->> 'finish')
         order by f.active desc limit 1),
      jsonb_build_object('name', cfg ->> 'finish'))
  );

  perform net.http_post(
    url := hook_url,
    body := payload,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 10000
  );
  return new;
exception when others then
  raise warning 'lead webhook not sent: %', sqlerrm;
  return new;
end;
$$;
