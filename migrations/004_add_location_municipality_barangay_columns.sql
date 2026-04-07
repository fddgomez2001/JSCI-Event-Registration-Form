-- Add structured address columns to registration tables.
-- This keeps the existing address column while adding searchable parts.

alter table if exists public.individual_registrations
  add column if not exists location text,
  add column if not exists municipality text,
  add column if not exists barangay text;

alter table if exists public.bulk_registrations
  add column if not exists location text,
  add column if not exists municipality text,
  add column if not exists barangay text;

-- Optional backfill for existing records with address format:
-- "Barangay, Municipality, Location" or "Barangay, Municipality, Location (details)"
update public.individual_registrations
set
  barangay = coalesce(nullif(trim(split_part(address, ',', 1)), ''), barangay),
  municipality = coalesce(nullif(trim(split_part(address, ',', 2)), ''), municipality),
  location = coalesce(
    nullif(trim(regexp_replace(split_part(address, ',', 3), '\\s*\\(.*\\)$', '')), ''),
    location
  )
where address is not null and trim(address) <> '';

update public.bulk_registrations
set
  barangay = coalesce(nullif(trim(split_part(address, ',', 1)), ''), barangay),
  municipality = coalesce(nullif(trim(split_part(address, ',', 2)), ''), municipality),
  location = coalesce(
    nullif(trim(regexp_replace(split_part(address, ',', 3), '\\s*\\(.*\\)$', '')), ''),
    location
  )
where address is not null and trim(address) <> '';
