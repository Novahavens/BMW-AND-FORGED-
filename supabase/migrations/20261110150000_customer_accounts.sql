-- Customer accounts (Google sign-in through Supabase Auth).
--
-- A signed-in customer gets a profile row and a "garage": the share codes (saved_configurations) and
-- enquiries / PDF leads (leads) they create carry their user id. Anonymous use is unchanged: user_id
-- stays null and every existing policy, the get_configuration RPC and the lead email trigger keep
-- working as before. The admin (/admin, password sign-in, public.admin_users + private.is_admin()) is
-- not touched: customers are ordinary authenticated users who are not on the allowlist, so every
-- "admins ..." policy still says no to them.
--
-- Owner steps (Supabase dashboard, Google provider, the two optional indexes): docs/ACCOUNTS.md.
-- The indexes on user_id are not in this file: they must be built CONCURRENTLY, which cannot run
-- inside the transaction the SQL editor (or `supabase db push`) wraps a migration in; run them on
-- their own afterwards, as the doc shows. No secrets live in this file.

-- ----------------------------------------------------------------------------------------------
-- 1. profiles: one row per auth user, created by a trigger on auth.users
-- ----------------------------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  phone text check (phone is null or char_length(phone) <= 40),
  city text check (city is null or char_length(city) <= 120),
  -- The customer's own car, from the catalogue (kept when the car is retired: set null)
  primary_car_id text references public.cars (id) on delete set null,
  chassis_code text check (chassis_code is null or char_length(chassis_code) <= 20),
  exterior_paint_id text references public.paints (id) on delete set null,
  brake_system text check (brake_system is null or brake_system in ('M Compound Steel', 'M Carbon Ceramic', 'Bespoke Big Brake Kit')),
  preferred_finish_id text references public.wheel_finishes (id) on delete set null,
  marketing_opt_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.profiles is 'Customer profile, one per auth.users row (created by handle_new_user). POPIA: name, email, phone, city and car preferences, deleted with the auth user.';

alter table public.profiles enable row level security;

-- The row is created from the Google account's metadata the moment the user is created, so the
-- first page load after sign-in already finds it. Security definer: the trigger runs as the table
-- owner, since the new user has no session yet. search_path is pinned, and every name is qualified.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    coalesce(nullif(new.raw_user_meta_data ->> 'avatar_url', ''), nullif(new.raw_user_meta_data ->> 'picture', ''))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Users that existed before this migration (the admins) get a profile row too; harmless, and it
-- keeps "one profile per user" true.
insert into public.profiles (id, email, display_name, avatar_url)
select u.id, u.email,
  coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), nullif(u.raw_user_meta_data ->> 'name', ''), split_part(coalesce(u.email, ''), '@', 1)),
  coalesce(nullif(u.raw_user_meta_data ->> 'avatar_url', ''), nullif(u.raw_user_meta_data ->> 'picture', ''))
from auth.users u
on conflict (id) do nothing;

drop trigger if exists touch_updated_at on public.profiles;
create trigger touch_updated_at before update on public.profiles
  for each row execute function private.touch_updated_at();

-- RLS: a customer reads and edits their own row; admins read every row (the enquiries view can show
-- who a lead belongs to); nobody deletes directly: the row goes with the auth user (cascade), which
-- the owner deletes in the dashboard on a POPIA request.
drop policy if exists "owners read own profile" on public.profiles;
create policy "owners read own profile" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
drop policy if exists "admins read profiles" on public.profiles;
create policy "admins read profiles" on public.profiles
  for select to authenticated using ((select private.is_admin()));
drop policy if exists "owners update own profile" on public.profiles;
create policy "owners update own profile" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
-- Fallback for a user created before the trigger existed, or if the trigger is ever disabled: the
-- client may create its own row (and only its own).
drop policy if exists "owners create own profile" on public.profiles;
create policy "owners create own profile" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);

grant select, insert, update on public.profiles to authenticated;

-- ----------------------------------------------------------------------------------------------
-- 2. saved_configurations: the garage (owner, name, updated_at)
-- ----------------------------------------------------------------------------------------------
alter table public.saved_configurations add column if not exists user_id uuid references auth.users (id) on delete set null;
alter table public.saved_configurations add column if not exists name text check (name is null or char_length(name) <= 80);
alter table public.saved_configurations add column if not exists updated_at timestamptz not null default now();
comment on column public.saved_configurations.user_id is 'Owner (null for anonymous share codes). Listed in the customer''s garage. Index: see docs/ACCOUNTS.md (built concurrently, outside this migration).';
comment on column public.saved_configurations.name is 'The customer''s own name for the build (null = show the code).';

drop trigger if exists touch_updated_at on public.saved_configurations;
create trigger touch_updated_at before update on public.saved_configurations
  for each row execute function private.touch_updated_at();

-- Inserts: anyone may still save a build, but a row may only be stamped with the caller's own id
-- (anon: user_id must stay null).
drop policy if exists "anyone saves a configuration" on public.saved_configurations;
create policy "anyone saves a configuration" on public.saved_configurations
  for insert to anon, authenticated
  with check (user_id is null or user_id = (select auth.uid()));

-- Owners list, rename and delete their own builds. "admins read configurations" (earlier migration)
-- stays as it is; share links keep going through get_configuration(p_code), which anyone with the
-- code may call.
drop policy if exists "owners read own configurations" on public.saved_configurations;
create policy "owners read own configurations" on public.saved_configurations
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "owners rename own configurations" on public.saved_configurations;
create policy "owners rename own configurations" on public.saved_configurations
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "owners delete own configurations" on public.saved_configurations;
create policy "owners delete own configurations" on public.saved_configurations
  for delete to authenticated using (user_id = (select auth.uid()));

grant update, delete on public.saved_configurations to authenticated;

-- Ownership of a saved build is never transferred. A share code is a secret that opens the build
-- (get_configuration), not proof of who made it: anyone holding a /?config=CODE link could otherwise
-- sign in, take an anonymous build over and later delete it, killing the sharer's link. So "Save to
-- garage" on the summary saves a NEW copy owned by the customer (a plain insert, stamped with their
-- id by the client), and the only server-side change to an existing row is renaming one the caller
-- already owns. The earlier claim function is removed where it was applied.
drop function if exists public.claim_configuration(text, text);

-- Renames one of the caller's own builds (the garage's "Rename", and the name given on "Save to
-- garage"). The exact code is required, the row must carry the caller's id, and nothing else on the
-- row changes. An empty name clears it (the garage then shows the code). Returns true when a row was
-- updated: false for an unknown code, an anonymous build or someone else's.
create or replace function public.rename_configuration(p_code text, p_name text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  n int;
begin
  if uid is null then
    return false;
  end if;
  update public.saved_configurations
     set name = nullif(left(btrim(p_name), 80), ''),
         updated_at = now()
   where code = upper(p_code)
     and user_id = uid;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;
revoke all on function public.rename_configuration(text, text) from public, anon;
grant execute on function public.rename_configuration(text, text) to authenticated;

-- ----------------------------------------------------------------------------------------------
-- 3. leads: enquiries and PDF downloads remember who sent them
-- ----------------------------------------------------------------------------------------------
alter table public.leads add column if not exists user_id uuid references auth.users (id) on delete set null;
comment on column public.leads.user_id is 'The signed-in customer who sent it (null for anonymous visitors). Index: see docs/ACCOUNTS.md.';

-- Same rule as for configurations: anyone may send, but only as themselves. The rate limit and the
-- email webhook triggers (earlier migrations) are unchanged. "admins read leads" / "admins delete
-- leads" stay.
drop policy if exists "anyone sends an enquiry" on public.leads;
create policy "anyone sends an enquiry" on public.leads
  for insert to anon, authenticated
  with check (user_id is null or user_id = (select auth.uid()));
drop policy if exists "owners read own leads" on public.leads;
create policy "owners read own leads" on public.leads
  for select to authenticated using (user_id = (select auth.uid()));
