-- Repopulate attendee_call_queue from registration tables
-- Run this to restore attendees after clearing the queue

-- Clear the queue first
delete from public.attendee_call_queue;

-- Insert individual registrations into the queue
insert into public.attendee_call_queue (
  attendee_key,
  source_type,
  source_id,
  source_index,
  conference,
  full_name,
  phone_number,
  church,
  ministry,
  address,
  local_church_pastor,
  call_status,
  claimed_by,
  claimed_at,
  call_lock_expires_at,
  status_set_by,
  status_set_at,
  created_at,
  updated_at
)
select
  concat('ind-', id::text) as attendee_key,
  'individual'::text as source_type,
  id as source_id,
  0 as source_index,
  conference,
  full_name,
  phone_number,
  church,
  ministry,
  address,
  local_church_pastor,
  'available'::text as call_status,
  null::text as claimed_by,
  null::timestamptz as claimed_at,
  null::timestamptz as call_lock_expires_at,
  null::text as status_set_by,
  null::timestamptz as status_set_at,
  created_at,
  now() as updated_at
from public.individual_registrations
on conflict (attendee_key) do nothing;

-- Insert bulk registration attendees into the queue
insert into public.attendee_call_queue (
  attendee_key,
  source_type,
  source_id,
  source_index,
  conference,
  full_name,
  phone_number,
  church,
  ministry,
  address,
  local_church_pastor,
  call_status,
  claimed_by,
  claimed_at,
  call_lock_expires_at,
  status_set_by,
  status_set_at,
  created_at,
  updated_at
)
select
  concat('bulk-', bra.bulk_registration_id::text, '-', row_number() over (partition by bra.bulk_registration_id order by bra.created_at)::text) as attendee_key,
  'bulk'::text as source_type,
  bra.bulk_registration_id as source_id,
  row_number() over (partition by bra.bulk_registration_id order by bra.created_at)::int - 1 as source_index,
  br.conference,
  bra.attendee_name as full_name,
  bra.attendee_phone as phone_number,
  coalesce(bra.attendee_church, br.church) as church,
  coalesce(bra.attendee_ministry, br.ministry) as ministry,
  coalesce(bra.attendee_address, br.address) as address,
  coalesce(bra.attendee_local_church_pastor, br.local_church_pastor) as local_church_pastor,
  'available'::text as call_status,
  null::text as claimed_by,
  null::timestamptz as claimed_at,
  null::timestamptz as call_lock_expires_at,
  null::text as status_set_by,
  null::timestamptz as status_set_at,
  bra.created_at,
  now() as updated_at
from public.bulk_registration_attendees bra
join public.bulk_registrations br on bra.bulk_registration_id = br.id
on conflict (attendee_key) do nothing;
