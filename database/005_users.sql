-- Users tab: lets the admin-users Edge Function read and set app roles.
-- The function runs as Supabase's service_role (server-side only, never in the browser). It needs
-- table privileges on app_users to list roles, store an invited person's role, and change roles.
-- Row-level security still applies to everyone else. Safe to rerun.
grant select, insert, update, delete on public.app_users to service_role;
