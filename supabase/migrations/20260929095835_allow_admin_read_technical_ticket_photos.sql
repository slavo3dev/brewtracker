-- =====================================================
-- Allow managers and CEOs to read technical ticket photos
-- =====================================================

create policy "CEO and managers can read technical ticket photos"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'technical-ticket-photos'
  and (
    public.is_ceo()
    or public.is_manager()
  )
);