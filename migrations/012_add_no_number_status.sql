-- Add "no_number" status to attendee_call_queue
-- Run this after migration 011

-- First, we need to remove the old check constraint and add the new one
alter table public.attendee_call_queue
drop constraint if exists attendee_call_queue_call_status_check;

alter table public.attendee_call_queue
add constraint attendee_call_queue_call_status_check
check (call_status in ('available', 'calling', 'confirmed', 'not_attending', 'follow_up_needed', 'no_number'));

-- Add a field to track when number was requested
alter table public.attendee_call_queue
add column if not exists number_requested_at timestamptz;

alter table public.attendee_call_queue
add column if not exists number_requested_by text;

-- Create index for faster filtering
create index if not exists idx_attendee_call_queue_no_number
  on public.attendee_call_queue (call_status)
  where call_status = 'no_number';

create index if not exists idx_attendee_call_queue_number_requested_at
  on public.attendee_call_queue (number_requested_at desc);
