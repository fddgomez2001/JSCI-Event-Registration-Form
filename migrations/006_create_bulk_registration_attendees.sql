-- Link each bulk attendee to a parent bulk contact record.
-- Run this in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.bulk_registration_attendees (
  id uuid primary key default gen_random_uuid(),
  bulk_registration_id uuid not null references public.bulk_registrations(id) on delete cascade,
  attendee_name text not null,
  attendee_phone text,
  attendee_ministry text,
  attendee_church text,
  attendee_address text,
  attendee_local_church_pastor text,
  created_at timestamptz not null default now()
);

create index if not exists idx_bulk_registration_attendees_bulk_id
  on public.bulk_registration_attendees (bulk_registration_id);

create index if not exists idx_bulk_registration_attendees_bulk_id_created_at
  on public.bulk_registration_attendees (bulk_registration_id, created_at);

alter table public.bulk_registration_attendees enable row level security;

drop policy if exists "allow_anon_insert_bulk_attendees" on public.bulk_registration_attendees;
create policy "allow_anon_insert_bulk_attendees"
  on public.bulk_registration_attendees
  for insert
  to anon
  with check (true);

drop policy if exists "allow_authenticated_select_bulk_attendees" on public.bulk_registration_attendees;
create policy "allow_authenticated_select_bulk_attendees"
  on public.bulk_registration_attendees
  for select
  to authenticated
  using (true);

-- Backfill attendee links from existing bulk_registrations.attendee_names
insert into public.bulk_registration_attendees (bulk_registration_id, attendee_name)
select
  b.id,
  trim(name_part) as attendee_name
from public.bulk_registrations b,
     regexp_split_to_table(coalesce(b.attendee_names, ''), E'\\n|,') as name_part
where trim(name_part) <> '';

-- For older rows that only had attendee_name, inherit baseline details from parent bulk record.
update public.bulk_registration_attendees a
set
  attendee_phone = coalesce(a.attendee_phone, b.phone_number),
  attendee_ministry = coalesce(a.attendee_ministry, b.ministry),
  attendee_church = coalesce(a.attendee_church, b.church),
  attendee_address = coalesce(a.attendee_address, b.address),
  attendee_local_church_pastor = coalesce(a.attendee_local_church_pastor, b.local_church_pastor)
from public.bulk_registrations b
where a.bulk_registration_id = b.id;
