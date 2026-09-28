-- Every new lead (PDF download or enquiry) is posted to the n8n "FORGEDSA · Lead email" workflow,
-- which emails forgedsa1@gmail.com a branded summary of the lead and their build.
--
-- The webhook URL is a secret (anyone holding it could send mail), so it lives in Supabase Vault,
-- not in this file:
--   select vault.create_secret('<n8n production webhook URL>', 'lead_webhook_url');
-- To change it later: select vault.update_secret(id, '<new URL>') from vault.secrets where name = 'lead_webhook_url';
-- With no secret set the trigger does nothing, and a failed call never blocks the lead being saved.

create extension if not exists pg_net;

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

  -- The lead stores display names; look the rest up so the email can show swatches, the wheel image and price.
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
         from public.cars c where c.name = cfg ->> 'car' limit 1),
      jsonb_build_object('name', cfg ->> 'car')),
    'paint', coalesce(
      (select jsonb_build_object('name', p.name, 'code', p.code, 'hex', p.hex, 'type', p.type)
         from public.paints p where p.name = cfg ->> 'paint' order by p.active desc limit 1),
      jsonb_build_object('name', cfg ->> 'paint')),
    'wheel', coalesce(
      (select jsonb_build_object('name', w.name, 'code', w.code, 'style', w.style, 'image_url', w.image_url,
                                 'price_usd', coalesce((w.price_by_size ->> (cfg ->> 'size'))::numeric, w.price_per_set))
         from public.wheels w where w.name = cfg ->> 'wheel' order by w.active desc limit 1),
      jsonb_build_object('name', cfg ->> 'wheel')),
    'finish', coalesce(
      (select jsonb_build_object('name', f.name, 'color_name', f.color_name, 'hex', f.hex)
         from public.wheel_finishes f where f.name = cfg ->> 'finish' order by f.active desc limit 1),
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

revoke all on function private.notify_lead_webhook() from public, anon, authenticated;

drop trigger if exists leads_notify_webhook on public.leads;
create trigger leads_notify_webhook
  after insert on public.leads
  for each row execute function private.notify_lead_webhook();
