
-- INV-V3-05: Prevent stale photo uploads from replacing
-- newer captures for the same visit, machine, stage and kind.

CREATE OR REPLACE FUNCTION public.upsert_service_visit_photo(
  p_source_visit_id text,
  p_stop_id uuid,
  p_machine_id uuid,
  p_stage public.service_photo_stage,
  p_kind public.service_photo_kind,
  p_storage_path text,
  p_captured_at timestamptz
)
RETURNS TABLE (
  photo_id uuid,
  accepted boolean
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.';
  END IF;

  IF p_storage_path IS NULL OR btrim(p_storage_path) = '' THEN
    RAISE EXCEPTION 'Photo storage path is required.';
  END IF;

  IF split_part(p_storage_path, '/', 1) <> v_user_id::text THEN
    RAISE EXCEPTION 'Photo storage path does not belong to the authenticated user.';
  END IF;

  IF p_captured_at IS NULL THEN
    RAISE EXCEPTION 'Photo capture timestamp is required.';
  END IF;

  RETURN QUERY
  WITH upserted AS (
    INSERT INTO public.service_visit_photos (
      uploaded_by,
      source_visit_id,
      stop_id,
      machine_id,
      stage,
      kind,
      storage_path,
      captured_at
    )
    VALUES (
      v_user_id,
      p_source_visit_id,
      p_stop_id,
      p_machine_id,
      p_stage,
      p_kind,
      p_storage_path,
      p_captured_at
    )
    ON CONFLICT (source_visit_id, machine_id, stage, kind)
    DO UPDATE SET
      storage_path = EXCLUDED.storage_path,
      captured_at = EXCLUDED.captured_at
    WHERE
      public.service_visit_photos.uploaded_by = v_user_id
      AND (
        EXCLUDED.captured_at > public.service_visit_photos.captured_at
        OR (
          EXCLUDED.captured_at = public.service_visit_photos.captured_at
          AND EXCLUDED.storage_path =
              public.service_visit_photos.storage_path
        )
      )
    RETURNING id
  )
  SELECT upserted.id, true
  FROM upserted;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT p.id, false
    FROM public.service_visit_photos AS p
    WHERE p.source_visit_id = p_source_visit_id
      AND p.machine_id = p_machine_id
      AND p.stage = p_stage
      AND p.kind = p_kind
      AND p.uploaded_by = v_user_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_service_visit_photo(
  text,
  uuid,
  uuid,
  public.service_photo_stage,
  public.service_photo_kind,
  text,
  timestamptz
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.upsert_service_visit_photo(
  text,
  uuid,
  uuid,
  public.service_photo_stage,
  public.service_photo_kind,
  text,
  timestamptz
) TO authenticated;
