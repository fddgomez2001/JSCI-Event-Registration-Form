-- Create attendee_number_requests table to track requests for admin notification
-- Run this after migration 011

create table if not exists public.attendee_number_requests (
  id uuid primary key default gen_random_uuid(),
  attendee_key text not null,
  conference text not null check (conference in ('leyte', 'cebu')),
  attendee_name text not null,
  requested_by text not null,
  requested_at timestamptz not null default now(),
  admin_notified_at timestamptz,
  number_added_at timestamptz,
  number_added_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(attendee_key, requested_at)
);

-- Create indexes for faster queries
create index if not exists idx_number_requests_conference
  on public.attendee_number_requests (conference);

create index if not exists idx_number_requests_requested_at
  on public.attendee_number_requests (requested_at desc);

create index if not exists idx_number_requests_admin_notified
  on public.attendee_number_requests (admin_notified_at)
  where admin_notified_at is null;

create index if not exists idx_number_requests_attendee_key
  on public.attendee_number_requests (attendee_key);

-- Enable row level security
alter table public.attendee_number_requests enable row level security;

drop policy if exists "allow_public_select_number_requests" on public.attendee_number_requests;
create policy "allow_public_select_number_requests"
  on public.attendee_number_requests
  for select
  to anon, authenticated
  using (true);
