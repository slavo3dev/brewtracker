-- =====================================================
-- FLOW-5b - Service Visit Photos
-- =====================================================

-- -----------------------------------------------------
-- Enums
-- -----------------------------------------------------

CREATE TYPE service_photo_stage AS ENUM (
    'before',
    'after',
    'signature'
);

CREATE TYPE service_photo_kind AS ENUM (
    'exterior',
    'interior_hopper'
);

-- -----------------------------------------------------
-- Table
-- -----------------------------------------------------

CREATE TABLE public.service_visit_photos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    uploaded_by uuid NOT NULL
        REFERENCES public.users(id)
        ON DELETE RESTRICT,

    source_visit_id text NOT NULL,

    stop_id uuid NOT NULL
        REFERENCES public.stops(id)
        ON DELETE CASCADE,

    machine_id uuid NOT NULL
        REFERENCES public.machines(id)
        ON DELETE CASCADE,

    stage service_photo_stage NOT NULL,

    kind service_photo_kind NOT NULL,

    storage_path text NOT NULL,

    captured_at timestamptz NOT NULL,

    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT service_visit_photos_unique_visit_stage_kind
        UNIQUE (
            source_visit_id,
            stage,
            kind
        )
);

-- -----------------------------------------------------
-- Indexes
-- -----------------------------------------------------

CREATE INDEX idx_service_visit_photos_uploaded_by
ON public.service_visit_photos(uploaded_by);

CREATE INDEX idx_service_visit_photos_stop
ON public.service_visit_photos(stop_id);

CREATE INDEX idx_service_visit_photos_machine
ON public.service_visit_photos(machine_id);

CREATE INDEX idx_service_visit_photos_visit
ON public.service_visit_photos(source_visit_id);

-- -----------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------

ALTER TABLE public.service_visit_photos
ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------
-- Drivers
-- Can only access photos belonging to themselves
-- -----------------------------------------------------

CREATE POLICY "Drivers manage own service photos"
ON public.service_visit_photos
FOR ALL
USING (
    uploaded_by = auth.uid()
)
WITH CHECK (
    uploaded_by = auth.uid()
);

-- -----------------------------------------------------
-- Managers
-- Same regional access pattern as other tables
-- -----------------------------------------------------

CREATE POLICY "Managers manage regional service photos"
ON public.service_visit_photos
FOR ALL
USING (
    is_manager()
    AND EXISTS (
        SELECT 1
        FROM public.users u
        WHERE u.id = uploaded_by
        AND u.region = current_user_region()
    )
)
WITH CHECK (
    is_manager()
    AND EXISTS (
        SELECT 1
        FROM public.users u
        WHERE u.id = uploaded_by
        AND u.region = current_user_region()
    )
);

-- -----------------------------------------------------
-- CEOs
-- Full access
-- -----------------------------------------------------

CREATE POLICY "CEOs manage all service photos"
ON public.service_visit_photos
FOR ALL
USING (
    is_ceo()
)
WITH CHECK (
    is_ceo()
);