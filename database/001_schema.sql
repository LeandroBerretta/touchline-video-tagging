create table if not exists public.app_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'viewer'))
);

alter table public.app_users enable row level security;

revoke all on public.app_users from anon, authenticated;
grant select on public.app_users to authenticated;

drop policy if exists "Users can read their own role" on public.app_users;
create policy "Users can read their own role"
  on public.app_users
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  vimeo_url text not null,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'published')),
  tags jsonb not null default '[]'::jsonb
    check (jsonb_typeof(tags) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);

alter table public.videos
  add column if not exists published_at timestamptz;

alter table public.videos enable row level security;

revoke all on public.videos from anon, authenticated;
grant select, insert, update, delete on public.videos to authenticated;

drop policy if exists "Admins and viewers can read permitted videos" on public.videos;
create policy "Admins and viewers can read permitted videos"
  on public.videos
  for select
  to authenticated
  using (
    exists (
      select 1 from public.app_users
      where user_id = (select auth.uid())
        and role = 'admin'
    )
    or (
      status = 'published'
      and exists (
        select 1 from public.app_users
        where user_id = (select auth.uid())
          and role = 'viewer'
      )
    )
  );

drop policy if exists "Admins can add videos" on public.videos;
create policy "Admins can add videos"
  on public.videos
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.app_users
      where user_id = (select auth.uid())
        and role = 'admin'
    )
  );

drop policy if exists "Admins can edit videos" on public.videos;
create policy "Admins can edit videos"
  on public.videos
  for update
  to authenticated
  using (
    exists (
      select 1 from public.app_users
      where user_id = (select auth.uid())
        and role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.app_users
      where user_id = (select auth.uid())
        and role = 'admin'
    )
  );

drop policy if exists "Admins can remove videos" on public.videos;
create policy "Admins can remove videos"
  on public.videos
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.app_users
      where user_id = (select auth.uid())
        and role = 'admin'
    )
  );
