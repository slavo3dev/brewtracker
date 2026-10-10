------------------------------------------------------------
-- FLOW-5b / FLOW-9
-- Allow deterministic service-photo paths to be replaced
------------------------------------------------------------

drop policy if exists
  "Users can update own service visit photos"
on storage.objects;

create policy
  "Users can update own service visit photos"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'service-visit-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'service-visit-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);