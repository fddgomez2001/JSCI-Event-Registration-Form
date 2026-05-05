-- Track every QR lookup and attendance action by committee name.

create table if not exists public.qr_scan_logs (
  id uuid primary key default gen_random_uuid(),
  attendee_id uuid not null references public.attendee_call_queue(id) on delete cascade,
  attendee_name text not null,
  committee_name text not null,
  action_type text not null check (action_type in ('lookup', 'checkin', 'lunch')),
  conference text not null check (conference in ('leyte', 'cebu')),
  created_at timestamptz not null default now()
);

create index if not exists idx_qr_scan_logs_attendee_id
  on public.qr_scan_logs (attendee_id);

create index if not exists idx_qr_scan_logs_committee_name
  on public.qr_scan_logs (committee_name);

create index if not exists idx_qr_scan_logs_action_type
  on public.qr_scan_logs (action_type);

create index if not exists idx_qr_scan_logs_created_at
  on public.qr_scan_logs (created_at desc);
