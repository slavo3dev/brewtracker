------------------------------------------------------------
-- FLOW-5: Service visit before-photo storage
------------------------------------------------------------

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'service-visit-photos',
  'service-visit-photos',
  false,
  10485760,
  array['image/jpeg']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

------------------------------------------------------------
-- Drivers can manage files inside their own user folder:
--
-- service-visit-photos/
--   <auth-user-id>/
--     <local-visit-id>/
--       before/
--         exterior-....jpg
--         interior_hopper-....jpg
------------------------------------------------------------

drop policy if exists
  "Users can upload own service visit photos"
on storage.objects;

create policy
  "Users can upload own service visit photos"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'service-visit-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists
  "Users can read own service visit photos"
on storage.objects;

create policy
  "Users can read own service visit photos"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'service-visit-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists
  "Users can delete own service visit photos"
on storage.objects;

create policy
  "Users can delete own service visit photos"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'service-visit-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);