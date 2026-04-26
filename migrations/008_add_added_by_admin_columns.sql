-- Adds explicit admin-origin flags to registration tables.
-- Run this migration in Supabase SQL Editor.

alter table if exists public.individual_registrations
  add column if not exists added_by_admin boolean not null default false;

alter table if exists public.bulk_registrations
  add column if not exists added_by_admin boolean not null default false;

-- Backfill existing admin-created bulk rows based on contact label.
update public.bulk_registrations
set added_by_admin = true
where lower(trim(contact_name)) = 'added by admin';
