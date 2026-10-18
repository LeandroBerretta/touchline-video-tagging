-- Saved playlists: a coach's selection of clips from one video, with a title and note.
-- Safe to rerun.
create table if not exists public.playlists (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  note text not null default '' check (char_length(note) <= 1000),
  tag_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(tag_ids) = 'array'),
  clip_seconds integer not null default 20 check (clip_seconds between 5 and 60),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists playlists_video_id_idx on public.playlists (video_id);

alter table public.playlists enable row level security;

revoke all on public.playlists from anon, authenticated;
grant select, insert, delete on public.playlists to authenticated;

-- Admins see every playlist; viewers only those whose video is published.
drop policy if exists "Admins and viewers can read permitted playlists" on public.playlists;
create policy "Admins and viewers can read permitted playlists"
  on public.playlists
  for select
  to authenticated
  using (
    exists (
      select 1 from public.app_users
      where user_id = (select auth.uid())
        and role = 'admin'
    )
    or (
      exists (
        select 1 from public.app_users
        where user_id = (select auth.uid())
          and role = 'viewer'
      )
      and exists (
        select 1 from public.videos
        where videos.id = playlists.video_id
          and videos.status = 'published'
      )
    )
  );

drop policy if exists "Admins can add playlists" on public.playlists;
create policy "Admins can add playlists"
  on public.playlists
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.app_users
      where user_id = (select auth.uid())
        and role = 'admin'
    )
  );

drop policy if exists "Admins can remove playlists" on public.playlists;
create policy "Admins can remove playlists"
  on public.playlists
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.app_users
      where user_id = (select auth.uid())
        and role = 'admin'
    )
  );
