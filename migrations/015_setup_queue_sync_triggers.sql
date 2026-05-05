-- Setup automatic queue synchronization triggers
-- This ensures attendees are automatically added to the call queue when registered
-- Run this after running migration 014

-- Trigger for individual registrations
create or replace function public.sync_individual_to_call_queue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.attendee_call_queue (
      attendee_key,
      source_type,
      source_id,
      source_index,
      conference,
      full_name,
      phone_number,
      church,
      ministry,
      address,
      local_church_pastor,
      call_status,
      created_at,
      updated_at
    )
    values (
      concat('ind-', new.id::text),
      'individual',
      new.id,
      0,
      new.conference,
      new.full_name,
      new.phone_number,
      new.church,
      new.ministry,
      new.address,
      new.local_church_pastor,
      'available',
      new.created_at,
      now()
    )
    on conflict (attendee_key) do update
    set
      full_name = excluded.full_name,
      phone_number = excluded.phone_number,
      church = excluded.church,
      ministry = excluded.ministry,
      address = excluded.address,
      local_church_pastor = excluded.local_church_pastor,
      updated_at = now();
  elsif tg_op = 'UPDATE' and (
    new.full_name != old.full_name or
    new.phone_number != old.phone_number or
    new.church != old.church or
    new.ministry != old.ministry or
    new.address != old.address or
    new.local_church_pastor != old.local_church_pastor
  ) then
    update public.attendee_call_queue
    set
      full_name = new.full_name,
      phone_number = new.phone_number,
      church = new.church,
      ministry = new.ministry,
      address = new.address,
      local_church_pastor = new.local_church_pastor,
      updated_at = now()
    where attendee_key = concat('ind-', new.id::text);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_individual_to_call_queue on public.individual_registrations;
create trigger trg_sync_individual_to_call_queue
after insert or update on public.individual_registrations
for each row
execute function public.sync_individual_to_call_queue();

-- Trigger for bulk attendees
create or replace function public.sync_bulk_attendee_to_call_queue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attendee_key text;
  v_index int;
begin
  if tg_op = 'INSERT' or tg_op = 'UPDATE' then
    -- Calculate the index position for this attendee within their bulk registration
    select coalesce(max(source_index), -1) + 1 into v_index
    from public.attendee_call_queue
    where source_id = new.bulk_registration_id and source_type = 'bulk';
    
    -- Use deterministic key based on bulk ID and attendee name hash
    v_attendee_key := concat('bulk-', new.bulk_registration_id::text, '-', md5(new.attendee_name)::text);

    insert into public.attendee_call_queue (
      attendee_key,
      source_type,
      source_id,
      source_index,
      conference,
      full_name,
      phone_number,
      church,
      ministry,
      address,
      local_church_pastor,
      call_status,
      created_at,
      updated_at
    )
    select
      v_attendee_key,
      'bulk',
      new.bulk_registration_id,
      v_index,
      br.conference,
      new.attendee_name,
      new.attendee_phone,
      coalesce(new.attendee_church, br.church),
      coalesce(new.attendee_ministry, br.ministry),
      coalesce(new.attendee_address, br.address),
      coalesce(new.attendee_local_church_pastor, br.local_church_pastor),
      'available',
      new.created_at,
      now()
    from public.bulk_registrations br
    where br.id = new.bulk_registration_id
    on conflict (attendee_key) do update
    set
      full_name = excluded.full_name,
      phone_number = excluded.phone_number,
      church = excluded.church,
      ministry = excluded.ministry,
      address = excluded.address,
      local_church_pastor = excluded.local_church_pastor,
      updated_at = now();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_bulk_attendee_to_call_queue on public.bulk_registration_attendees;
create trigger trg_sync_bulk_attendee_to_call_queue
after insert or update on public.bulk_registration_attendees
for each row
execute function public.sync_bulk_attendee_to_call_queue();
