-- create or replace with a different parameter list creates a NEW overload instead of
-- replacing the old one (same signature required for true replace). This leaves the old
-- single-argument version in place, which makes any call with only p_route_date ambiguous
-- between the two overloads (including the real daily cron job). Drop the old one.
drop function if exists public.generate_routes_from_templates(date);
