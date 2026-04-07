-- Run this SQL in your Supabase SQL Editor.
-- It creates tables for individual and bulk event registrations.

create extension if not exists pgcrypto;

create table if not exists public.individual_registrations (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  church text not null,
  ministry text not null,
  address text not null,
  local_church_pastor text not null,
  phone_number text not null,
  conference text not null default 'leyte' check (conference in ('leyte', 'cebu')),
  created_at timestamptz not null default now()
);

create table if not exists public.bulk_registrations (
  id uuid primary key default gen_random_uuid(),
  contact_name text not null,
  church text not null,
  ministry text not null,
  address text not null,
  local_church_pastor text not null,
  phone_number text not null,
  attendee_count integer not null check (attendee_count > 0),
  attendee_names text not null,
  conference text not null default 'leyte' check (conference in ('leyte', 'cebu')),
  created_at timestamptz not null default now()
);

alter table public.individual_registrations enable row level security;
alter table public.bulk_registrations enable row level security;

-- Allow anonymous/public inserts from your registration forms.
drop policy if exists "allow_anon_insert_individual" on public.individual_registrations;
create policy "allow_anon_insert_individual"
  on public.individual_registrations
  for insert
  to anon
  with check (true);

drop policy if exists "allow_anon_insert_bulk" on public.bulk_registrations;
create policy "allow_anon_insert_bulk"
  on public.bulk_registrations
  for insert
  to anon
  with check (true);

-- Optional: allow authenticated users to read their data later.
drop policy if exists "allow_authenticated_select_individual" on public.individual_registrations;
create policy "allow_authenticated_select_individual"
  on public.individual_registrations
  for select
  to authenticated
  using (true);

drop policy if exists "allow_authenticated_select_bulk" on public.bulk_registrations;
create policy "allow_authenticated_select_bulk"
  on public.bulk_registrations
  for select
  to authenticated
  using (true);
