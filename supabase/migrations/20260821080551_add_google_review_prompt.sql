-- =====================================================
-- FLOW-15: Post-service Google review prompt
-- =====================================================

create table if not exists public.app_settings (
  id boolean primary key default true
    check (id = true),

  google_review_url text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Keep this as a single-row application configuration table.
insert into public.app_settings (
  id,
  google_review_url
)
values (
  true,
  null
)
on conflict (id) do nothing;

alter table public.app_settings enable row level security;