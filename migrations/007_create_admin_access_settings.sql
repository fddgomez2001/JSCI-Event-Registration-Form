-- Stores hashed 4-digit admin access code for /admin pre-login gate.
-- Default initial code is 1234. Change it immediately from Admin panel.

create table if not exists public.admin_access_settings (
  id integer primary key check (id = 1),
  code_hash text not null,
  updated_at timestamptz not null default now()
);

alter table public.admin_access_settings enable row level security;

drop policy if exists "deny_anon_admin_access_settings" on public.admin_access_settings;
create policy "deny_anon_admin_access_settings"
  on public.admin_access_settings
  for all
  to anon
  using (false)
  with check (false);

drop policy if exists "deny_authenticated_admin_access_settings" on public.admin_access_settings;
create policy "deny_authenticated_admin_access_settings"
  on public.admin_access_settings
  for all
  to authenticated
  using (false)
  with check (false);

-- The first successful /api/admin/security verification will bootstrap id=1
-- with a hashed default code (1234) if no row exists yet.
