CREATE OR REPLACE FUNCTION public.current_user_has_machine_stop(
  target_machine_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.stops AS s
    JOIN public.routes AS r
      ON r.id = s.route_id
    WHERE r.driver_id = (SELECT auth.uid())
      AND (
        s.machine_id = target_machine_id
        OR EXISTS (
          SELECT 1
          FROM public.stop_machines AS sm
          WHERE sm.stop_id = s.id
            AND sm.machine_id = target_machine_id
        )
      )
  );
$$;