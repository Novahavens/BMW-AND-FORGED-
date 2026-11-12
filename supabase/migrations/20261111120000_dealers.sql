-- Dealerships: a dealer login (/dealer) that sees only the enquiries FORGED assigns to its dealership.
--
-- Roles after this migration
--   admin   public.admin_users + private.is_admin()          unchanged: the whole catalogue, prices, every enquiry,
--                                                              and now the dealers and who they get.
--   dealer  public.dealer_users + private.current_dealer_id() NEW: read the enquiries assigned to its dealership,
--                                                              and update their status and notes. Nothing else.
--   customer any other signed-in user (Google)                unchanged.
--
-- Prices stay with FORGED: no policy here gives a dealer write access to cars, paints, wheels,
-- wheel_finishes or the allowlists. Those still say "admins only" (private.is_admin()).
--
-- A dealer is an email on an allowlist (same pattern as admin_users) rather than a role column on
-- profiles: profiles are editable by their owner, so a role there would be one policy mistake away from
-- self-promotion. As with admins, the email must be CONFIRMED in Supabase Auth (Google sign-in arrives
-- confirmed; a password user created in the dashboard with "Auto Confirm", or who set a password through
-- the emailed link, is confirmed too).
--
-- Applied to the live project on 2026-11-11 (as migration "dealers"; the leads.dealer_id index was built
-- separately with CREATE INDEX CONCURRENTLY). Owner steps and the RLS checks: docs/DEALERS.md.

-- ----------------------------------------------------------------------------------------------
-- 1. dealers and the people who may sign in for them
-- ----------------------------------------------------------------------------------------------
create table if not exists public.dealers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  city text check (city is null or char_length(city) <= 120),
  phone text check (phone is null or char_length(phone) <= 40),
  email text check (email is null or char_length(email) <= 200),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
comment on table public.dealers is 'A dealership. Enquiries are assigned to one (leads.dealer_id); its people sign in at /dealer.';
alter table public.dealers enable row level security;

create table if not exists public.dealer_users (
  email text primary key check (email = lower(email) and char_length(email) <= 200),
  dealer_id uuid not null references public.dealers (id) on delete cascade,
  created_at timestamptz not null default now()
);
comment on table public.dealer_users is 'Emails allowed to sign in as a dealer, one dealership each. Lower-case. Like admin_users: the allowlist, not the account.';
alter table public.dealer_users enable row level security;

-- The dealer the caller belongs to: confirmed email on the allowlist, dealership still active. Security
-- definer so it can read auth.users and the allowlist for the caller without exposing either; the
-- search_path is pinned and every name is qualified (same shape as private.is_admin()).
create or replace function private.current_dealer_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select d.id
  from auth.users u
  join public.dealer_users du on du.email = lower(u.email)
  join public.dealers d on d.id = du.dealer_id
  where u.id = (select auth.uid())
    and u.email_confirmed_at is not null
    and d.active
  limit 1;
$$;
revoke all on function private.current_dealer_id() from public;
grant execute on function private.current_dealer_id() to anon, authenticated;

-- What /dealer asks on load: "which dealership am I?" (zero rows for everyone else).
create or replace function public.my_dealer()
returns setof public.dealers
language sql
stable
security definer
set search_path = ''
as $$
  select d.* from public.dealers d where d.id = (select private.current_dealer_id());
$$;
revoke all on function public.my_dealer() from public, anon;
grant execute on function public.my_dealer() to authenticated;

-- Admins manage both tables; a dealer reads only its own dealership row.
drop policy if exists "admins manage dealers" on public.dealers;
create policy "admins manage dealers" on public.dealers
  for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
drop policy if exists "dealers read own dealership" on public.dealers;
create policy "dealers read own dealership" on public.dealers
  for select to authenticated using (id = (select private.current_dealer_id()));

drop policy if exists "admins manage dealer users" on public.dealer_users;
create policy "admins manage dealer users" on public.dealer_users
  for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

grant select, insert, update, delete on public.dealers, public.dealer_users to authenticated;

-- ----------------------------------------------------------------------------------------------
-- 2. leads: who handles an enquiry, and how it is going
-- ----------------------------------------------------------------------------------------------
alter table public.leads add column if not exists dealer_id uuid references public.dealers (id) on delete set null;
alter table public.leads add column if not exists status text not null default 'new'
  check (status in ('new', 'contacted', 'quoted', 'won', 'lost'));
alter table public.leads add column if not exists dealer_notes text
  check (dealer_notes is null or char_length(dealer_notes) <= 2000);
comment on column public.leads.dealer_id is 'The dealership this enquiry is assigned to (FORGED sets it in /admin). Null = FORGED handles it.';
comment on column public.leads.status is 'new, contacted, quoted, won or lost. Set by the dealer it is assigned to, or by FORGED.';
-- Index on leads.dealer_id: not in this file, it must be built CONCURRENTLY (cannot run inside a migration
-- transaction). Run it on its own afterwards: docs/DEALERS.md.

-- Visitors send enquiries, but may not choose a dealer, a status or notes: those are for FORGED and the
-- dealer. (Replaces the policy from 20261110150000; the user_id rule is kept as it was.)
drop policy if exists "anyone sends an enquiry" on public.leads;
create policy "anyone sends an enquiry" on public.leads
  for insert to anon, authenticated
  with check (
    (user_id is null or user_id = (select auth.uid()))
    and dealer_id is null and status = 'new' and dealer_notes is null
  );

drop policy if exists "dealers read assigned leads" on public.leads;
create policy "dealers read assigned leads" on public.leads
  for select to authenticated using (dealer_id = (select private.current_dealer_id()));

-- FORGED may reassign and update any lead; a dealer may update only its own, and the WITH CHECK keeps
-- dealer_id on its own dealership (it cannot hand a lead to another dealer or take one from the pool).
drop policy if exists "admins update leads" on public.leads;
create policy "admins update leads" on public.leads
  for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
drop policy if exists "dealers update assigned leads" on public.leads;
create policy "dealers update assigned leads" on public.leads
  for update to authenticated
  using (dealer_id = (select private.current_dealer_id()))
  with check (dealer_id = (select private.current_dealer_id()));

-- Only these three columns are ever updated from the browser (contact details and the build stay as
-- the customer sent them).
revoke update on public.leads from authenticated;
grant update (dealer_id, status, dealer_notes) on public.leads to authenticated;
