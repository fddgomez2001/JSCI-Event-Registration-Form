-- Supabase service role setup for admin data reads.
-- NOTE: You cannot create or rotate SUPABASE_SERVICE_ROLE_KEY using SQL.
-- Get it from Supabase Dashboard: Project Settings -> API -> service_role key.
-- Then set it in your app environment (for example in .env.local):
-- SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

-- Keep RLS enabled and allow service_role to read both registration tables.
-- service_role is intended for server-side use only.

drop policy if exists "allow_service_role_select_individual" on public.individual_registrations;
create policy "allow_service_role_select_individual"
  on public.individual_registrations
  for select
  to service_role
  using (true);

drop policy if exists "allow_service_role_select_bulk" on public.bulk_registrations;
create policy "allow_service_role_select_bulk"
  on public.bulk_registrations
  for select
  to service_role
  using (true);
