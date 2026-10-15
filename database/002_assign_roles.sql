-- Replace each placeholder with that Supabase Auth user's UUID before running.
insert into public.app_users (user_id, role)
values
  ('ADMIN-USER-UUID', 'admin'),
  ('VIEWER-USER-UUID', 'viewer')
on conflict (user_id)
do update set role = excluded.role;

-- Optional verification:
-- select u.email, a.role
-- from auth.users u
-- join public.app_users a on a.user_id = u.id
-- order by a.role;
