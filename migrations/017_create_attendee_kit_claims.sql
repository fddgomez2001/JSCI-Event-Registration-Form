-- Track per-attendee kit claim items
create table if not exists public.attendee_kit_claims (
  attendee_id uuid primary key,
  tote_bag boolean not null default false,
  mug boolean not null default false,
  notebook boolean not null default false,
  pencil boolean not null default false,
  claimed_at timestamptz,
  claimed_by_committee text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_attendee_kit_claims_claimed_at on public.attendee_kit_claims(claimed_at);

alter table public.attendee_kit_claims enable row level security;

drop policy if exists "allow_service_role_attendee_kit_claims" on public.attendee_kit_claims;
create policy "allow_service_role_attendee_kit_claims"
  on public.attendee_kit_claims
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "allow_authenticated_attendee_kit_claims" on public.attendee_kit_claims;
create policy "allow_authenticated_attendee_kit_claims"
  on public.attendee_kit_claims
  for all
  to authenticated
  using (true)
  with check (true);
