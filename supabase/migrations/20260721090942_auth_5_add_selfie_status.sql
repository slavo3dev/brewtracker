------------------------------------------------------------
-- AUTH-5: Track clock-in selfie completion
------------------------------------------------------------

create type public.selfie_verification_status as enum (
  'required',
  'uploaded',
  'missing',
  'waived'
);

alter table public.time_entries
add column selfie_status
  public.selfie_verification_status
  not null
  default 'required';

------------------------------------------------------------
-- Backfill existing entries
------------------------------------------------------------

update public.time_entries
set selfie_status = case
  when clock_in_selfie_url is not null then
    'uploaded'::public.selfie_verification_status

  when review_status = 'approved' then
    'waived'::public.selfie_verification_status

  when status in ('open', 'manager_override') then
    'required'::public.selfie_verification_status

  else
    'missing'::public.selfie_verification_status
end;

------------------------------------------------------------
-- Uploaded status requires a Storage path
------------------------------------------------------------

alter table public.time_entries
add constraint time_entries_uploaded_selfie_requires_path
check (
  selfie_status <> 'uploaded'
  or clock_in_selfie_url is not null
);

------------------------------------------------------------
-- Prevent field staff from waiving their own selfie
------------------------------------------------------------

create or replace function public.protect_time_entry_selfie_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if
    auth.uid() is not null
    and public.is_field_staff()
    and new.selfie_status is distinct from old.selfie_status
    and new.selfie_status in ('waived', 'missing')
  then
    raise exception
      'Field staff cannot waive or mark their own selfie as missing.';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_time_entry_selfie_status
on public.time_entries;

create trigger protect_time_entry_selfie_status
before update of selfie_status
on public.time_entries
for each row
execute function public.protect_time_entry_selfie_status();

create index if not exists time_entries_selfie_status_idx
on public.time_entries(selfie_status);