-- Lead hardening (code review, Oct 2026):
-- 1. The lead email looked paints up by display name, but "Frozen Portimao Blue" (C6R, X1E) and
--    "Frozen Deep Grey" (P7X, C64) are each used by two BMW codes, so it could quote the wrong code.
--    The site now stores carId/paintId/wheelId/finishId in leads.configuration; look those up first
--    (older leads without ids still fall back to the name).
-- 2. leads accepts inserts from anyone with the public key, and each insert sent an email.
--    - At most 5 leads per email address per 10 minutes (more are rejected).
--    - Past 30 leads in 10 minutes in total, leads are saved but no email is sent.

create index if not exists leads_email_created_idx on public.leads (lower(email), created_at desc);
create index if not exists leads_created_idx on public.leads (created_at desc);

create or replace function private.limit_lead_rate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.leads l
        where lower(l.email) = lower(new.email) and l.created_at > now() - interval '10 minutes') >= 5 then
    raise exception 'Too many requests from this email address. Please try again in a few minutes.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function private.limit_lead_rate() from public, anon, authenticated;

drop trigger if exists leads_rate_limit on public.leads;
create trigger leads_rate_limit
  before insert on public.leads
  for each row execute function private.limit_lead_rate();

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
      (select jsonb_build_object('name', w.name, 'code', w.code, 'style', w.style, 'image_url', w.image_url,
                                 'price_usd', coalesce((w.price_by_size ->> (cfg ->> 'size'))::numeric, w.price_per_set))
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

