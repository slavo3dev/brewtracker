create or replace function public.attach_technical_ticket_photo(
  p_ticket_id uuid,
  p_storage_path text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_ticket public.technical_tickets%rowtype;
  v_expected_path text;
begin
  if v_user_id is null then
    raise exception 'You must be signed in.';
  end if;

  select *
  into v_ticket
  from public.technical_tickets
  where id = p_ticket_id
    and reported_by = v_user_id
  for update;

  if not found then
    raise exception 'Ticket not found or access denied.';
  end if;

  v_expected_path :=
    v_user_id::text || '/' ||
    v_ticket.source_visit_id || '/' ||
    v_ticket.id::text || '.jpg';

  if p_storage_path is distinct from v_expected_path then
    raise exception 'Invalid technical ticket photo path.';
  end if;

  if v_ticket.photo_storage_path is not null
     and v_ticket.photo_storage_path <> v_expected_path then
    raise exception 'This ticket already has a different photo.';
  end if;

  if not exists (
    select 1
    from storage.objects
    where bucket_id = 'technical-ticket-photos'
      and name = v_expected_path
  ) then
    raise exception 'The uploaded technical issue photo was not found.';
  end if;

  update public.technical_tickets
  set photo_storage_path = v_expected_path,
      updated_at = now()
  where id = v_ticket.id
    and reported_by = v_user_id;

  if not found then
    raise exception 'The technical issue photo could not be attached.';
  end if;

  return v_expected_path;
end;
$$;

revoke all
on function public.attach_technical_ticket_photo(uuid, text)
from public, anon;

grant execute
on function public.attach_technical_ticket_photo(uuid, text)
to authenticated;