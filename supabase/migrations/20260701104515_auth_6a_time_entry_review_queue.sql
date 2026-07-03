create type public.time_entry_review_status as enum (
  'pending',
  'approved',
  'flagged',
  'rejected'
);

alter table public.time_entries
add column if not exists review_status public.time_entry_review_status not null default 'pending',
add column if not exists reviewed_by uuid references public.users(id),
add column if not exists reviewed_at timestamptz,
add column if not exists review_note text,
add column if not exists review_reason text;

create index if not exists time_entries_review_status_idx
on public.time_entries(review_status);

create index if not exists time_entries_reviewed_by_idx
on public.time_entries(reviewed_by);