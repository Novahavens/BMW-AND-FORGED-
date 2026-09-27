-- Keys the wheel pipeline uses to call the ingest-wheel edge function. Only SHA-256 hashes are stored.
-- RLS is on with no policies, so only the service role (used inside the function) can read the table.
create table if not exists public.ingest_keys (
  key_hash text primary key check (key_hash ~ '^[0-9a-f]{64}$'),
  label text not null default '',
  created_at timestamptz not null default now()
);
alter table public.ingest_keys enable row level security;
revoke all on public.ingest_keys from anon, authenticated;
