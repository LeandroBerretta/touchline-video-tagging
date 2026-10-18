-- Teams and squads: each video belongs to a team; each team has players and staff.
-- Structure only: add teams and members in the app (Teams tab). Safe to rerun.
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now()
);

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  kind text not null default 'player' check (kind in ('player', 'staff')),
  shirt_number integer check (shirt_number between 0 and 999),
  staff_role text not null default '' check (char_length(staff_role) <= 60),
  -- Removed members are kept (active = false) so old moments and stats still show them.
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists team_members_team_id_idx on public.team_members (team_id);

alter table public.videos
  add column if not exists team_id uuid references public.teams(id) on delete set null;

alter table public.teams enable row level security;
alter table public.team_members enable row level security;

revoke all on public.teams from anon, authenticated;
revoke all on public.team_members from anon, authenticated;
grant select, insert, update, delete on public.teams to authenticated;
grant select, insert, update on public.team_members to authenticated;

-- Teams: admins and viewers can read; admins add and rename.
drop policy if exists "Admins and viewers can read teams" on public.teams;
create policy "Admins and viewers can read teams"
  on public.teams
  for select
  to authenticated
  using (
    exists (
      select 1 from public.app_users
      where user_id = (select auth.uid())
        and role in ('admin', 'viewer')
    )
  );

drop policy if exists "Admins can add teams" on public.teams;
create policy "Admins can add teams"
  on public.teams
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.app_users
      where user_id = (select auth.uid())
        and role = 'admin'
    )
  );

drop policy if exists "Admins can edit teams" on public.teams;
create policy "Admins can edit teams"
  on public.teams
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

-- Deleting a team also deletes its squad (cascade). The app only offers it when no videos use the team;
-- any video that still did would be left without a team (set null).
drop policy if exists "Admins can delete teams" on public.teams;
create policy "Admins can delete teams"
  on public.teams
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.app_users
      where user_id = (select auth.uid())
        and role = 'admin'
    )
  );

-- Members: admins see everyone; viewers see players only (never staff).
drop policy if exists "Admins and viewers can read permitted members" on public.team_members;
create policy "Admins and viewers can read permitted members"
  on public.team_members
  for select
  to authenticated
  using (
    exists (
      select 1 from public.app_users
      where user_id = (select auth.uid())
        and role = 'admin'
    )
    or (
      kind = 'player'
      and exists (
        select 1 from public.app_users
        where user_id = (select auth.uid())
          and role = 'viewer'
      )
    )
  );

drop policy if exists "Admins can add members" on public.team_members;
create policy "Admins can add members"
  on public.team_members
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.app_users
      where user_id = (select auth.uid())
        and role = 'admin'
    )
  );

drop policy if exists "Admins can edit members" on public.team_members;
create policy "Admins can edit members"
  on public.team_members
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
