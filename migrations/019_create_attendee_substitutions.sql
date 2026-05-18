create table if not exists public.attendee_substitutions (
  id uuid primary key default gen_random_uuid(),
  attendee_id uuid not null references public.attendee_call_queue(id) on delete cascade,
  attendee_key text not null,
  source_type text not null,
  source_id text not null,
  source_index integer not null default 0,
  conference text,
  original_full_name text not null,
  substitute_full_name text not null,
  requested_by_committee text,
  substituted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendee_substitutions_attendee_unique unique (attendee_id)
);

create index if not exists attendee_substitutions_source_idx
  on public.attendee_substitutions (source_type, source_id, source_index);

create index if not exists attendee_substitutions_conference_idx
  on public.attendee_substitutions (conference, substituted_at desc);
