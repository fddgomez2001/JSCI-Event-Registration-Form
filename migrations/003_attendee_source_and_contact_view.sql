-- Unified attendee view with source and contact person mapping.
-- This helps identify whether an attendee came from individual or bulk registration,
-- and who the attendee is under (contact person).

create or replace view public.attendee_directory as
select
  i.id as record_id,
  'individual'::text as registration_source,
  i.full_name as attendee_name,
  i.full_name as contact_person,
  i.church,
  i.ministry,
  i.address,
  i.local_church_pastor,
  i.phone_number,
  i.created_at
from public.individual_registrations i

union all

select
  b.id as record_id,
  'bulk'::text as registration_source,
  trim(attendee_name) as attendee_name,
  b.contact_name as contact_person,
  b.church,
  b.ministry,
  b.address,
  b.local_church_pastor,
  b.phone_number,
  b.created_at
from public.bulk_registrations b,
lateral regexp_split_to_table(coalesce(b.attendee_names, ''), E'\\s*[\\n,]+\\s*') as attendee_name
where trim(attendee_name) <> '';

comment on view public.attendee_directory is
'Lists attendees from individual and bulk registrations with source and contact person.';
