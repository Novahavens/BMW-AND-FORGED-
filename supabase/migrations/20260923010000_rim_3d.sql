-- 3D rims: PNGs are extruded into solid spokes by default; optional uploaded GLB rims.
alter table public.wheels
  add column image_extrude boolean not null default true,
  add column model_url text,
  add column model_flip boolean not null default false;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('rim-models', 'rim-models', true, 52428800, array['model/gltf-binary', 'application/octet-stream'])
on conflict (id) do nothing;

drop policy "admins upload assets" on storage.objects;
drop policy "admins update assets" on storage.objects;
drop policy "admins delete assets" on storage.objects;
drop policy "admins read assets" on storage.objects;

create policy "admins upload assets" on storage.objects for insert to authenticated
  with check (bucket_id in ('car-models', 'rim-images', 'rim-models') and (select private.is_admin()));
create policy "admins update assets" on storage.objects for update to authenticated
  using (bucket_id in ('car-models', 'rim-images', 'rim-models') and (select private.is_admin()));
create policy "admins delete assets" on storage.objects for delete to authenticated
  using (bucket_id in ('car-models', 'rim-images', 'rim-models') and (select private.is_admin()));
create policy "admins read assets" on storage.objects for select to authenticated
  using (bucket_id in ('car-models', 'rim-images', 'rim-models') and (select private.is_admin()));
