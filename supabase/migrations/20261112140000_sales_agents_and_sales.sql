-- Sales agents (dealership staff), the dealership's fixed commission per set, and sales recorded from won
-- enquiries. FORGED admin only: no dealer, customer or visitor policy touches these tables or the new column.
--
-- How the money works (owner, 2026-11-12):
--   customer price = FORGED price + the dealership's markup
--   FORGED pays the dealership a fixed commission per wheel set (dealers.commission_per_set_zar); the amount
--   on a sale is a snapshot taken when the sale is recorded, so changing the rate later does not rewrite
--   past sales. Amounts are in rand (ZAR), as the owner deals in rand; the catalogue's USD prices are not used.
--
-- Additive only: two new tables and one new column with a default. Safe to run twice.

-- ----------------------------------------------------------------------------------------------
-- 1. the dealership's commission per set
-- ----------------------------------------------------------------------------------------------
alter table public.dealers add column if not exists commission_per_set_zar numeric(12, 2) not null default 0
  check (commission_per_set_zar >= 0);
comment on column public.dealers.commission_per_set_zar is
  'Rand FORGED pays this dealership per wheel set sold. Copied onto each sale when it is recorded.';

-- ----------------------------------------------------------------------------------------------
-- 2. sales agents: the people at a dealership who make the sale
-- ----------------------------------------------------------------------------------------------
create table if not exists public.sales_agents (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  email text check (email is null or char_length(email) <= 200),
  phone text check (phone is null or char_length(phone) <= 40),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
comment on table public.sales_agents is 'A salesperson at a dealership. Credited on sales; does not sign in.';
alter table public.sales_agents enable row level security;

-- ----------------------------------------------------------------------------------------------
-- 3. sales: one per won enquiry (or none if the enquiry is deleted later: the sale is kept)
-- ----------------------------------------------------------------------------------------------
create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid unique references public.leads (id) on delete set null,
  dealer_id uuid references public.dealers (id) on delete set null,
  agent_id uuid references public.sales_agents (id) on delete set null,
  sold_on date not null default current_date,
  sets integer not null default 1 check (sets between 1 and 100),
  forged_price_zar numeric(12, 2) not null default 0 check (forged_price_zar >= 0),
  dealer_markup_zar numeric(12, 2) not null default 0 check (dealer_markup_zar >= 0),
  commission_zar numeric(12, 2) not null default 0 check (commission_zar >= 0),
  commission_paid boolean not null default false,
  commission_paid_on date,
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.sales is
  'A sale recorded from a won enquiry. Customer price = forged_price_zar + dealer_markup_zar; commission_zar is what FORGED owes the dealership.';
alter table public.sales enable row level security;

create or replace function private.sales_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists sales_touch_updated_at on public.sales;
create trigger sales_touch_updated_at before update on public.sales
  for each row execute function private.sales_touch_updated_at();

-- ----------------------------------------------------------------------------------------------
-- 4. FORGED admins only
-- ----------------------------------------------------------------------------------------------
drop policy if exists "admins manage sales agents" on public.sales_agents;
create policy "admins manage sales agents" on public.sales_agents
  for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

drop policy if exists "admins manage sales" on public.sales;
create policy "admins manage sales" on public.sales
  for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

grant select, insert, update, delete on public.sales_agents, public.sales to authenticated;

-- Indexes: not in this file. Like leads.dealer_id (20261111120000_dealers.sql), build them CONCURRENTLY on their
-- own after applying, since CONCURRENTLY cannot run inside a migration transaction:
--   create index concurrently if not exists sales_agents_dealer_idx on public.sales_agents (dealer_id);
--   create index concurrently if not exists sales_dealer_sold_idx on public.sales (dealer_id, sold_on desc);
--   create index concurrently if not exists sales_agent_idx on public.sales (agent_id);
