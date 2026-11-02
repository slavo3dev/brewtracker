BEGIN;

-- Restore SELECT access required by the mobile
-- upsert(...).select("id") workflow.
DROP POLICY IF EXISTS
  "Field staff read own service signatures"
ON public.service_visit_signatures;

CREATE POLICY "Field staff read own service signatures"
ON public.service_visit_signatures
FOR SELECT
TO authenticated
USING (
  signed_by = (SELECT auth.uid())
  AND (SELECT public.is_field_staff())
);

-- Correct manager authorization so that the stop's
-- client is compared against the signature's client.
DROP POLICY IF EXISTS
  "Managers manage regional service signatures"
ON public.service_visit_signatures;

CREATE POLICY "Managers manage regional service signatures"
ON public.service_visit_signatures
FOR ALL
TO authenticated
USING (
  (SELECT public.is_manager())
  AND EXISTS (
    SELECT 1
    FROM public.stops AS s
    WHERE s.id = service_visit_signatures.stop_id
      AND s.client_id = service_visit_signatures.client_id
      AND public.client_is_in_current_user_region(s.client_id)
  )
)
WITH CHECK (
  (SELECT public.is_manager())
  AND EXISTS (
    SELECT 1
    FROM public.stops AS s
    WHERE s.id = service_visit_signatures.stop_id
      AND s.client_id = service_visit_signatures.client_id
      AND public.client_is_in_current_user_region(s.client_id)
  )
);

COMMIT;