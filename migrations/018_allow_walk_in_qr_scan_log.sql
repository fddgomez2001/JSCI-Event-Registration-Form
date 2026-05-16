-- Allow walk-in registration actions to be logged in qr_scan_logs.

alter table public.qr_scan_logs
  drop constraint if exists qr_scan_logs_action_type_check;

alter table public.qr_scan_logs
  add constraint qr_scan_logs_action_type_check
  check (action_type in ('lookup', 'checkin', 'lunch', 'walk_in_registration'));
