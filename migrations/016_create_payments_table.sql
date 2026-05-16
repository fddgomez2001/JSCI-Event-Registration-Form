-- Create payments table to track cash payments at event registration
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  attendee_id uuid not null,
  attendee_name text not null,
  amount numeric(10, 2) not null default 200.00,
  currency text not null default 'PHP',
  payment_method text not null default 'cash' check (payment_method in ('cash', 'online', 'check', 'other')),
  payment_status text not null default 'pending' check (payment_status in ('pending', 'paid', 'cancelled', 'refunded')),
  paid_at timestamptz,
  paid_by_committee text,
  notes text,
  conference text not null check (conference in ('leyte', 'cebu')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Create index for fast lookups by attendee_id
create index if not exists idx_payments_attendee_id on public.payments(attendee_id);
create index if not exists idx_payments_status on public.payments(payment_status);
create index if not exists idx_payments_conference on public.payments(conference);

-- Enable row level security
alter table public.payments enable row level security;

-- Allow service role (admin) to access payments
drop policy if exists "allow_service_role_payments" on public.payments;
create policy "allow_service_role_payments"
  on public.payments
  for all
  to service_role
  using (true)
  with check (true);

-- Allow authenticated users to access payments (for committee dashboard)
drop policy if exists "allow_authenticated_payments" on public.payments;
create policy "allow_authenticated_payments"
  on public.payments
  for all
  to authenticated
  using (true)
  with check (true);
