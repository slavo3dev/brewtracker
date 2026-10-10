-- =====================================================
-- FLOW-12 - Technical ticket photo storage policies
-- =====================================================

create policy "Drivers upload technical ticket photos"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'technical-ticket-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Drivers read own technical ticket photos"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'technical-ticket-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Drivers update own technical ticket photos"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'technical-ticket-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'technical-ticket-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Drivers delete own technical ticket photos"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'technical-ticket-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);