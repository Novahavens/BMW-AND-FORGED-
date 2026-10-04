-- Finished rim photos per finish for the 2D wheel stage: { "<finish id>": "<public PNG url>" }.
-- Written by the ingest-sprite function (n8n "FORGED finish sprites"); a finish without a sprite is
-- shown by tinting the wheel's grey rim photo in the browser.
alter table public.wheels add column if not exists rim_sprites jsonb not null default '{}'::jsonb;
