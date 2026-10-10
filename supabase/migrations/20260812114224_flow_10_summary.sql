------------------------------------------------------------
-- FLOW-10
-- Step 8: closing verification, service summary,
-- client notification and survey
------------------------------------------------------------

------------------------------------------------------------
-- Client notification address
------------------------------------------------------------

alter table public.clients
add column if not exists service_email text;

comment on column public.clients.service_email is
'Email address that receives completed service visit summaries.';

------------------------------------------------------------
-- Completed service visit summary
------------------------------------------------------------

create table public.service_visit_summaries (
  id uuid primary key default gen_random_uuid(),

  source_visit_id text not null unique,

  stop_id uuid not null
    references public.stops(id)
    on delete cascade,

  client_id uuid not null
    references public.clients(id)
    on delete cascade,

  machine_id uuid not null
    references public.machines(id)
    on delete restrict,

  completed_by uuid not null
    references public.users(id)
    on delete restrict,

  closing_scanned_value text not null,
  closing_verified_at timestamptz not null,

  completed_at timestamptz not null,

  summary jsonb not null default '{}'::jsonb,

  notification_status text not null default 'pending'
    check (
      notification_status in (
        'pending',
        'sent',
        'failed',
        'skipped'
      )
    ),

  notification_error text,

  email_sent_at timestamptz,

  survey_token uuid not null
    default gen_random_uuid()
    unique,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index service_visit_summaries_stop_idx
on public.service_visit_summaries(stop_id);

create index service_visit_summaries_client_idx
on public.service_visit_summaries(client_id);

create index service_visit_summaries_machine_idx
on public.service_visit_summaries(machine_id);

------------------------------------------------------------
-- Survey
------------------------------------------------------------

create table public.service_visit_surveys (
  id uuid primary key default gen_random_uuid(),

  summary_id uuid not null unique
    references public.service_visit_summaries(id)
    on delete cascade,

  rating integer not null
    check (rating between 1 and 5),

  submitted_at timestamptz not null default now()
);

------------------------------------------------------------
-- RLS
------------------------------------------------------------

alter table public.service_visit_summaries
enable row level security;

alter table public.service_visit_surveys
enable row level security;

------------------------------------------------------------
-- Field staff can read their own completed summaries
------------------------------------------------------------

create policy "Field staff read own visit summaries"
on public.service_visit_summaries
for select
to authenticated
using (
  completed_by = auth.uid()
);

------------------------------------------------------------
-- Managers can read regional summaries
------------------------------------------------------------

create policy "Managers read regional visit summaries"
on public.service_visit_summaries
for select
to authenticated
using (
  public.is_manager()
  and exists (
    select 1
    from public.clients c
    where c.id = service_visit_summaries.client_id
      and c.region = public.current_user_region()
  )
);

------------------------------------------------------------
-- CEO can read everything
------------------------------------------------------------

create policy "CEOs read all visit summaries"
on public.service_visit_summaries
for select
to authenticated
using (
  public.is_ceo()
);

------------------------------------------------------------
-- No public INSERT RLS for surveys.
--
-- Public survey submission goes through the Next.js
-- server using the admin/service-role client.
------------------------------------------------------------