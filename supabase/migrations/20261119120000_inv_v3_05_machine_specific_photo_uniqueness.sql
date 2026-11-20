-- INV-V3-05: Support photos for multiple machines in one visit.
--
-- Previously, photos were unique by visit, stage, and kind.
-- This prevented two machines from recording the same photo kind
-- during a shared client visit.
--
-- Existing single-machine photo records remain compatible.

ALTER TABLE public.service_visit_photos
  DROP CONSTRAINT service_visit_photos_unique_visit_stage_kind;

ALTER TABLE public.service_visit_photos
  ADD CONSTRAINT service_visit_photos_unique_visit_machine_stage_kind
  UNIQUE (source_visit_id, machine_id, stage, kind);
