-- =====================================================
-- FLOW-9 — After-service photo and client signature
-- =====================================================

-- -----------------------------------------------------
-- Client configuration
-- -----------------------------------------------------

ALTER TABLE public.clients
ADD COLUMN signature_required boolean NOT NULL DEFAULT true;

-- -----------------------------------------------------
-- Allow completed-machine photos
-- -----------------------------------------------------

ALTER TYPE public.service_photo_kind
ADD VALUE IF NOT EXISTS 'completed_machine';

-- -----------------------------------------------------
-- Signatures
-- -----------------------------------------------------

CREATE TABLE public.service_visit_signatures (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    signed_by uuid NOT NULL
        REFERENCES public.users(id)
        ON DELETE RESTRICT,

    source_visit_id text NOT NULL,

    stop_id uuid NOT NULL
        REFERENCES public.stops(id)
        ON DELETE CASCADE,

    client_id uuid NOT NULL
        REFERENCES public.clients(id)
        ON DELETE CASCADE,

    machine_id uuid NOT NULL
        REFERENCES public.machines(id)
        ON DELETE CASCADE,

    storage_path text NOT NULL,

    signed_at timestamptz NOT NULL,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT service_visit_signatures_unique_visit
        UNIQUE (source_visit_id)
);

CREATE INDEX idx_service_visit_signatures_signed_by
ON public.service_visit_signatures(signed_by);

CREATE INDEX idx_service_visit_signatures_stop
ON public.service_visit_signatures(stop_id);

CREATE INDEX idx_service_visit_signatures_client
ON public.service_visit_signatures(client_id);

CREATE INDEX idx_service_visit_signatures_machine
ON public.service_visit_signatures(machine_id);

ALTER TABLE public.service_visit_signatures
ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers manage own service signatures"
ON public.service_visit_signatures
FOR ALL
USING (signed_by = auth.uid())
WITH CHECK (signed_by = auth.uid());

CREATE POLICY "Managers manage regional service signatures"
ON public.service_visit_signatures
FOR ALL
USING (
    is_manager()
    AND EXISTS (
        SELECT 1
        FROM public.users u
        WHERE u.id = signed_by
        AND u.region = current_user_region()
    )
)
WITH CHECK (
    is_manager()
    AND EXISTS (
        SELECT 1
        FROM public.users u
        WHERE u.id = signed_by
        AND u.region = current_user_region()
    )
);

CREATE POLICY "CEOs manage all service signatures"
ON public.service_visit_signatures
FOR ALL
USING (is_ceo())
WITH CHECK (is_ceo());

-- -----------------------------------------------------
-- Private signature bucket
-- -----------------------------------------------------

INSERT INTO storage.buckets (
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
)
VALUES (
    'service-visit-signatures',
    'service-visit-signatures',
    false,
    2097152,
    ARRAY['image/png']
)
ON CONFLICT (id) DO UPDATE
SET
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

CREATE POLICY "Field staff upload own signatures"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'service-visit-signatures'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (
        current_user_role() = 'driver'
        OR current_user_role() = 'tech'
    )
);

CREATE POLICY "Field staff read own signatures"
ON storage.objects
FOR SELECT
TO authenticated
USING (
    bucket_id = 'service-visit-signatures'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Field staff update own signatures"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
    bucket_id = 'service-visit-signatures'
    AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
    bucket_id = 'service-visit-signatures'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Field staff delete own signatures"
ON storage.objects
FOR DELETE
TO authenticated
USING (
    bucket_id = 'service-visit-signatures'
    AND (storage.foldername(name))[1] = auth.uid()::text
);