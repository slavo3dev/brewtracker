-- The 20261104171218 migration that added the p_template_id overload only
-- revoked from "public", not from "anon"/"authenticated" by name — the
-- original single-argument overload (see 20260918065036) always revoked
-- from all three explicitly. On projects where default privileges grant
-- EXECUTE to anon/authenticated for new functions in the public schema,
-- revoking from "public" alone does not close that off. This is a
-- privileged, service-role-only bulk route generator; it must not be
-- callable via PostgREST by regular API clients.
revoke all
on function public.generate_routes_from_templates(date, uuid)
from anon;

revoke all
on function public.generate_routes_from_templates(date, uuid)
from authenticated;
