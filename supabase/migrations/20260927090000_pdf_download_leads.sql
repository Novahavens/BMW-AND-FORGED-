-- The summary PDF now asks for an email address and mobile number before it generates; each download
-- is saved as a lead with the configuration, marked source = 'pdf'. A name is optional there.
alter table public.leads alter column name drop not null;
alter table public.leads add column source text not null default 'enquiry'
  check (source in ('enquiry', 'pdf'));
