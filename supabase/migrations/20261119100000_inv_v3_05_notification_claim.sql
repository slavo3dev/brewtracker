-- INV-V3-05: Notification claim metadata
-- Applies to multi-machine notification handling.
-- Existing single-machine notification behavior remains unchanged.

ALTER TABLE public.service_visit_summaries
  ADD COLUMN notification_claim_token uuid,
  ADD COLUMN notification_claimed_at timestamptz,
  ADD COLUMN notification_attempts integer NOT NULL DEFAULT 0
    CHECK (notification_attempts >= 0);

ALTER TABLE public.service_visit_summaries
  ADD CONSTRAINT service_visit_notification_claim_consistency
  CHECK (
    (notification_claim_token IS NULL AND notification_claimed_at IS NULL)
    OR
    (notification_claim_token IS NOT NULL AND notification_claimed_at IS NOT NULL)
  );

-- Atomically acquire a notification claim.
-- Callable only by the trusted Edge Function through service_role.

CREATE OR REPLACE FUNCTION public.claim_multi_machine_notification(
  p_summary_id uuid,
  p_claim_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_claimed boolean;
BEGIN
  IF p_summary_id IS NULL OR p_claim_token IS NULL THEN
    RAISE EXCEPTION 'Summary ID and claim token are required';
  END IF;

  UPDATE public.service_visit_summaries
  SET notification_claim_token = p_claim_token,
      notification_claimed_at = now(),
      notification_attempts = notification_attempts + 1,
      updated_at = now()
  WHERE id = p_summary_id
    AND machine_id IS NULL
    AND notification_status IN ('pending', 'failed')
    AND (
      notification_claim_token IS NULL
      OR notification_claimed_at < now() - interval '5 minutes'
    );

  v_claimed := FOUND;
  RETURN v_claimed;
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_multi_machine_notification(
  uuid, uuid
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.claim_multi_machine_notification(
  uuid, uuid
) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_multi_machine_notification(
  uuid, uuid
) TO service_role;

-- Finalize a notification only if the caller still owns its claim.

CREATE OR REPLACE FUNCTION public.finalize_multi_machine_notification(
  p_summary_id uuid,
  p_claim_token uuid,
  p_status text,
  p_error text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_updated boolean;
BEGIN
  IF p_summary_id IS NULL OR p_claim_token IS NULL THEN
    RAISE EXCEPTION 'Summary ID and claim token are required';
  END IF;

  IF p_status NOT IN ('sent', 'failed', 'skipped') THEN
    RAISE EXCEPTION 'Invalid notification status';
  END IF;

  UPDATE public.service_visit_summaries
  SET notification_status = p_status,
      notification_error = CASE
        WHEN p_status = 'sent' THEN NULL
        ELSE p_error
      END,
      email_sent_at = CASE
        WHEN p_status = 'sent' THEN now()
        ELSE NULL
      END,
      notification_claim_token = NULL,
      notification_claimed_at = NULL,
      updated_at = now()
  WHERE id = p_summary_id
    AND machine_id IS NULL
    AND notification_claim_token = p_claim_token
    AND notification_status IN ('pending', 'failed');

  v_updated := FOUND;
  RETURN v_updated;
END;
$function$;

REVOKE ALL ON FUNCTION public.finalize_multi_machine_notification(
  uuid, uuid, text, text
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.finalize_multi_machine_notification(
  uuid, uuid, text, text
) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.finalize_multi_machine_notification(
  uuid, uuid, text, text
) TO service_role;
