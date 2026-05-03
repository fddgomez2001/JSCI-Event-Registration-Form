-- Live attendee call queue for the Cathy, Jewel, and Geneveve dashboards.
-- Run this in Supabase SQL Editor after migrations 001 through 008.

create extension if not exists pgcrypto;

create table if not exists public.attendee_call_queue (
  id uuid primary key default gen_random_uuid(),
  attendee_key text not null unique,
  source_type text not null check (source_type in ('individual', 'bulk')),
  source_id uuid not null,
  source_index integer not null default 0,
  conference text not null check (conference in ('leyte', 'cebu')),
  full_name text not null,
  phone_number text,
  church text,
  ministry text,
  address text,
  local_church_pastor text,
  call_status text not null default 'available' check (
    call_status in ('available', 'calling', 'confirmed', 'not_attending', 'follow_up_needed')
  ),
  claimed_by text,
  claimed_at timestamptz,
  call_lock_expires_at timestamptz,
  status_set_by text,
  status_set_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_attendee_call_queue_conference
  on public.attendee_call_queue (conference);

create index if not exists idx_attendee_call_queue_call_status
  on public.attendee_call_queue (call_status);

create index if not exists idx_attendee_call_queue_claimed_by
  on public.attendee_call_queue (claimed_by);

create index if not exists idx_attendee_call_queue_full_name
  on public.attendee_call_queue (full_name);

alter table public.attendee_call_queue enable row level security;

drop policy if exists "allow_public_select_attendee_call_queue" on public.attendee_call_queue;
create policy "allow_public_select_attendee_call_queue"
  on public.attendee_call_queue
  for select
  to anon, authenticated
  using (true);

create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.claim_attendee_call(_attendee_key text, _caller_name text)
returns public.attendee_call_queue
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_row public.attendee_call_queue;
begin
  update public.attendee_call_queue
  set
    call_status = 'calling',
    claimed_by = _caller_name,
    claimed_at = coalesce(claimed_at, now()),
    call_lock_expires_at = now() + interval '5 minutes',
    status_set_by = _caller_name,
    updated_at = now()
  where attendee_key = _attendee_key
    and call_status not in ('confirmed', 'not_attending')
    and (
      claimed_by is null
      or claimed_by = _caller_name
      or call_lock_expires_at is null
      or call_lock_expires_at < now()
    )
  returning * into updated_row;

  if not found then
    raise exception 'This attendee is already being handled by another caller.';
  end if;

  return updated_row;
end;
$$;

create or replace function public.set_attendee_call_status(_attendee_key text, _caller_name text, _status text)
returns public.attendee_call_queue
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_row public.attendee_call_queue;
begin
  if _status not in ('confirmed', 'not_attending', 'follow_up_needed') then
    raise exception 'Invalid status value.';
  end if;

  update public.attendee_call_queue
  set
    call_status = _status,
    claimed_by = _caller_name,
    claimed_at = coalesce(claimed_at, now()),
    call_lock_expires_at = null,
    status_set_by = _caller_name,
    status_set_at = now(),
    updated_at = now()
  where attendee_key = _attendee_key
    and (
      claimed_by is null
      or claimed_by = _caller_name
      or call_lock_expires_at is null
      or call_lock_expires_at < now()
    )
  returning * into updated_row;

  if not found then
    raise exception 'This attendee is already being handled by another caller.';
  end if;

  return updated_row;
end;
$$;

drop trigger if exists trg_attendee_call_queue_updated_at on public.attendee_call_queue;
create trigger trg_attendee_call_queue_updated_at
before update on public.attendee_call_queue
for each row
execute function public.update_updated_at_column();

alter publication supabase_realtime add table public.attendee_call_queue;