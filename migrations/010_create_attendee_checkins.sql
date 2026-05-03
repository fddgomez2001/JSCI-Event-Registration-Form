-- Create attendee_checkins table to track check-ins and lunch

create table if not exists public.attendee_checkins (
  id uuid primary key default gen_random_uuid(),
  attendee_id uuid not null references public.attendee_call_queue(id) on delete cascade,
  checked_in boolean not null default false,
  checked_in_at timestamptz,
  lunch boolean not null default false,
  lunch_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_attendee_checkins_attendee_id on public.attendee_checkins (attendee_id);

create or replace function public.update_attendee_checkins_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_attendee_checkins_updated_at on public.attendee_checkins;
create trigger trg_attendee_checkins_updated_at
before update on public.attendee_checkins
for each row
execute function public.update_attendee_checkins_updated_at();
