-- Apex Forged configurator: editable catalogue, admin allowlist, asset storage.
-- Public (anon) can read active catalogue rows; only allowlisted admins can write.

create schema if not exists private;

create table public.admin_users (
  email text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);
alter table public.admin_users enable row level security;

-- Security definer so RLS policies can consult the allowlist without exposing it.
create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users
    where email = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  );
$$;
revoke all on function private.is_admin() from public;
grant usage on schema private to anon, authenticated;
grant execute on function private.is_admin() to anon, authenticated;

create policy "admins read allowlist" on public.admin_users
  for select to authenticated using ((select private.is_admin()));

create or replace function private.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.cars (
  id text primary key,
  name text not null,
  badge text not null default '',
  generation text not null default '',
  chassis_code text not null default '',
  engine text not null default '',
  power text not null default '',
  torque text not null default '',
  acceleration text not null default '',
  recommended_wheel_fitment jsonb not null default '{"front":"","rear":"","pcd":"5x112","cb":"66.6mm"}',
  body_style text not null default 'coupe' check (body_style in ('coupe', 'sedan')),
  model_url text,
  sort_order int not null default 0,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.paints (
  id text primary key,
  name text not null,
  code text not null default '',
  hex text not null default '#888888',
  type text not null default 'Metallic' check (type in ('Metallic', 'Frozen', 'Uni')),
  roughness real not null default 0.2,
  metalness real not null default 0.7,
  clearcoat real not null default 0.9,
  clearcoat_roughness real not null default 0.1,
  sort_order int not null default 0,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.wheel_finishes (
  id text primary key,
  name text not null,
  color_name text not null default '',
  hex text not null default '#cccccc',
  metalness real not null default 0.9,
  roughness real not null default 0.2,
  clearcoat real not null default 0.8,
  description text not null default '',
  badge text not null default '',
  sort_order int not null default 0,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.wheels (
  id text primary key,
  code text not null default '',
  name text not null,
  subtitle text not null default '',
  style text not null default '',
  spoke_type text not null default 'multi'
    check (spoke_type in ('multi', 'y_spoke', 'directional', 'mesh', 'aerodisc', 'clubsport')),
  spoke_count int not null default 10,
  weight_front_kg real not null default 0,
  weight_rear_kg real not null default 0,
  weight_savings_kg real not null default 0,
  standard_sizes text[] not null default array['19"', '20"'],
  price_per_set numeric not null default 0,
  description text not null default '',
  highlights text[] not null default '{}',
  available_variants text[] not null default '{}',
  default_variant text not null default 'liquid_metal',
  image_url text,
  sort_order int not null default 0,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.calipers (
  id text primary key,
  name text not null,
  hex text not null default '#0055b8',
  logo text not null default '',
  sort_order int not null default 0,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['cars', 'paints', 'wheel_finishes', 'wheels', 'calipers'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "public reads active rows" on public.%I for select to anon, authenticated
         using (active or (select private.is_admin()))', t);
    execute format(
      'create policy "admins insert" on public.%I for insert to authenticated
         with check ((select private.is_admin()))', t);
    execute format(
      'create policy "admins update" on public.%I for update to authenticated
         using ((select private.is_admin())) with check ((select private.is_admin()))', t);
    execute format(
      'create policy "admins delete" on public.%I for delete to authenticated
         using ((select private.is_admin()))', t);
    execute format(
      'create trigger touch_updated_at before update on public.%I
         for each row execute function private.touch_updated_at()', t);
  end loop;
end $$;

-- Public buckets: files are served by URL to the configurator; only admins may write.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('car-models', 'car-models', true, 52428800, array['model/gltf-binary', 'application/octet-stream']),
  ('rim-images', 'rim-images', true, 10485760, array['image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "admins upload assets" on storage.objects for insert to authenticated
  with check (bucket_id in ('car-models', 'rim-images') and (select private.is_admin()));
create policy "admins update assets" on storage.objects for update to authenticated
  using (bucket_id in ('car-models', 'rim-images') and (select private.is_admin()));
create policy "admins delete assets" on storage.objects for delete to authenticated
  using (bucket_id in ('car-models', 'rim-images') and (select private.is_admin()));
-- Upsert (x-upsert) also needs to read existing objects.
create policy "admins read assets" on storage.objects for select to authenticated
  using (bucket_id in ('car-models', 'rim-images') and (select private.is_admin()));
