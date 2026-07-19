------------------------------------------------------------
-- AUTH-5 Time-entry selfie storage
------------------------------------------------------------

------------------------------------------------------------
-- PRIVATE STORAGE BUCKET
------------------------------------------------------------

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'time-entry-selfies',
  'time-entry-selfies',
  false,
  5242880,
  array['image/jpeg']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

------------------------------------------------------------
-- REMOVE OLD POLICIES IF MIGRATION IS RE-RUN
------------------------------------------------------------

drop policy if exists
  "Field staff upload own time entry selfies"
on storage.objects;

drop policy if exists
  "Field staff read own time entry selfies"
on storage.objects;

drop policy if exists
  "Field staff delete own time entry selfies"
on storage.objects;

drop policy if exists
  "Managers read regional time entry selfies"
on storage.objects;

drop policy if exists
  "CEO reads all time entry selfies"
on storage.objects;

------------------------------------------------------------
-- FIELD STAFF STORAGE POLICIES
--
-- Path format:
-- {userId}/{timeEntryId}/clock-in-{timestamp}.jpg
------------------------------------------------------------

create policy "Field staff upload own time entry selfies"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'time-entry-selfies'
  and public.is_field_staff()
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Field staff read own time entry selfies"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'time-entry-selfies'
  and public.is_field_staff()
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Needed for cleanup if upload succeeds but database update fails.

create policy "Field staff delete own time entry selfies"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'time-entry-selfies'
  and public.is_field_staff()
  and (storage.foldername(name))[1] = auth.uid()::text
);

------------------------------------------------------------
-- ADMIN REVIEW ACCESS
------------------------------------------------------------

create policy "Managers read regional time entry selfies"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'time-entry-selfies'
  and public.is_manager()
  and exists (
    select 1
    from public.users
    where users.id::text = (storage.foldername(name))[1]
      and users.region = public.current_user_region()
  )
);

create policy "CEO reads all time entry selfies"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'time-entry-selfies'
  and public.is_ceo()
);