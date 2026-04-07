-- Add conference classification so registrations can be filtered per event.

alter table if exists public.individual_registrations
  add column if not exists conference text;

alter table if exists public.bulk_registrations
  add column if not exists conference text;

-- Backfill existing rows using location when available. Default to leyte.
update public.individual_registrations
set conference = case
  when lower(coalesce(location, '')) = 'cebu' then 'cebu'
  when lower(coalesce(location, '')) = 'leyte' then 'leyte'
  else 'leyte'
end
where conference is null;

update public.bulk_registrations
set conference = case
  when lower(coalesce(location, '')) = 'cebu' then 'cebu'
  when lower(coalesce(location, '')) = 'leyte' then 'leyte'
  else 'leyte'
end
where conference is null;

alter table public.individual_registrations
  alter column conference set default 'leyte';

alter table public.bulk_registrations
  alter column conference set default 'leyte';

alter table public.individual_registrations
  alter column conference set not null;

alter table public.bulk_registrations
  alter column conference set not null;

alter table public.individual_registrations
  drop constraint if exists individual_registrations_conference_check;
alter table public.individual_registrations
  add constraint individual_registrations_conference_check
  check (conference in ('leyte', 'cebu'));

alter table public.bulk_registrations
  drop constraint if exists bulk_registrations_conference_check;
alter table public.bulk_registrations
  add constraint bulk_registrations_conference_check
  check (conference in ('leyte', 'cebu'));

create index if not exists idx_individual_registrations_conference
  on public.individual_registrations (conference);

create index if not exists idx_bulk_registrations_conference
  on public.bulk_registrations (conference);

create index if not exists idx_individual_registrations_conference_phone
  on public.individual_registrations (conference, phone_number);
