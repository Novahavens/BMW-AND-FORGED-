-- Shareable configuration codes and enquiry leads.
-- Visitors (anon) may create both; nobody can list them from the browser.
-- A saved configuration is fetched by its exact code through a function; leads are admin-only.

create table public.saved_configurations (
  code text primary key check (code ~ '^[A-Z0-9]{10}$'),
  payload jsonb not null check (pg_column_size(payload) < 4000),
  created_at timestamptz not null default now()
);
alter table public.saved_configurations enable row level security;

create policy "anyone saves a configuration" on public.saved_configurations
  for insert to anon, authenticated with check (true);
create policy "admins read configurations" on public.saved_configurations
  for select to authenticated using ((select private.is_admin()));

create or replace function public.get_configuration(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select payload from public.saved_configurations where code = upper(p_code);
$$;
revoke all on function public.get_configuration(text) from public;
grant execute on function public.get_configuration(text) to anon, authenticated;

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 200),
  phone text check (char_length(phone) <= 40),
  message text check (char_length(message) <= 2000),
  consultation boolean not null default false,
  config_code text,
  configuration jsonb check (pg_column_size(configuration) < 4000),
  region text,
  created_at timestamptz not null default now()
);
alter table public.leads enable row level security;

create policy "anyone sends an enquiry" on public.leads
  for insert to anon, authenticated with check (true);
create policy "admins read leads" on public.leads
  for select to authenticated using ((select private.is_admin()));
create policy "admins delete leads" on public.leads
  for delete to authenticated using ((select private.is_admin()));

grant insert on public.saved_configurations, public.leads to anon, authenticated;
grant select, delete on public.leads to authenticated;
grant select on public.saved_configurations to authenticated;

-- The catalogue: the 2025 M5 (G90) replaces the F90 M5 CS, and the M4 and M5 get real 3D bodies.
insert into public.cars (id, name, badge, generation, chassis_code, engine, power, torque, acceleration,
  recommended_wheel_fitment, body_style, model_url, model_length_m, paint_mesh_match, hide_mesh_match, sort_order)
values ('m5_g90', 'BMW M5', 'M5 G90', 'G90', 'G90 M5', '4.4L S68 Twin-Turbo V8 M Hybrid', '727 HP / 535 kW',
  '1,000 Nm (738 lb-ft)', '0-100 km/h in 3.5s',
  '{"front":"20 x 9.5J","rear":"21 x 10.5J","pcd":"5x112","cb":"66.6mm"}'::jsonb, 'sedan',
  '/models/bmw-m5-g90.glb', 5.1, 'paint_material', '3dwheel|calliper', 3)
on conflict (id) do update set model_url = excluded.model_url, model_length_m = excluded.model_length_m,
  paint_mesh_match = excluded.paint_mesh_match, hide_mesh_match = excluded.hide_mesh_match, active = true;

update public.cars set active = false where id = 'm5_f90';

update public.cars set
  model_url = '/models/bmw-m4-competition.glb',
  model_length_m = 4.79,
  paint_mesh_match = 'zx1mtl',
  hide_mesh_match = '(^|[^a-z])(wheel|rim|tyre|tire|brake|caliper|rotor)|livery'
where id = 'm4_g82' and (model_url is null or model_url = '' or model_url like '%test%');
