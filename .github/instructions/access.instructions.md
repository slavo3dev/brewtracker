---
applyTo: "supabase/**,apps/web/src/lib/auth/**,apps/web/src/lib/supabase/**,apps/web/src/app/api/**,apps/web/proxy.ts,packages/types/src/permissions.ts,packages/types/src/database.ts"
---

# Access

Row-Level Security is the access model. A check that exists only in the browser is not access control.

Roles are `driver`, `tech`, `manager`, and `ceo`. A driver or tech sees their own routes, stops, and time entries. A manager sees their `region`. A CEO sees everything.

SQL helpers are `security definer` with `set search_path = public`: `current_user_role()`, `current_user_region()`, `is_ceo()`, `is_manager()`, `is_driver()`, and `is_field_staff()` (`driver` and `tech`). TypeScript helpers are in `packages/types/src/permissions.ts`. Server gates are `requireAdmin()` and `requireUserManager()` in `apps/web/src/lib/auth/`.

Field-staff policies use `is_field_staff()` plus ownership (`auth.uid()` or the assigned `driver_id`). A policy that checks only `is_driver()` on field data locks techs out. Manager policies compare `region` to `current_user_region()`. CEO policies use `is_ceo()`.

Schema changes are new files in `supabase/migrations/`. A dashboard-only schema change is a blocker. For every new table:

- `ENABLE ROW LEVEL SECURITY` is in the same migration. RLS left off is a blocker.
- Policies exist for the commands the app uses. RLS on with no policies, while app code reads or writes the table, is a blocker.
- `using (true)` or `with check (true)` for `authenticated` is a blocker unless the PR says the rows are public reference data.
- Status-like columns use a Postgres enum, not free text.

A new `security definer` function without `set search_path = public` is a blocker.

Browser code uses `createClient()` in `apps/web/src/lib/supabase/client.ts` (anon key). Server Components, actions, and route handlers use `createClient()` in `apps/web/src/lib/supabase/server.ts`, created inside the request, never cached at module scope. The service role is only `createAdminClient()` in `apps/web/src/lib/supabase/admin.ts`, or an Edge Function under `supabase/functions/`. `createAdminClient()` bypasses RLS, so that path must already have called `requireAdmin()`, `requireUserManager()`, or an equivalent server-side role check. Importing it from a client component, or calling it with no role check, is a blocker.

A new `middleware.ts` is a blocker. Session refresh stays in `apps/web/proxy.ts`.

A service-role key, API key, or other secret outside `.env.local` (and Edge Function `Deno.env.get`) is a blocker. Never put a service-role key behind `NEXT_PUBLIC_`. `.env.local` stays gitignored.
