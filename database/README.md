# Supabase database scripts

These SQL files define the Touchline database structure and account roles.
Run them in order from the Supabase SQL Editor:

1. `001_schema.sql` creates the app user-role table, video table, and access
   policies. It can be rerun to restore the policies and grants.
2. `002_assign_roles.sql` is a template for assigning the `admin` and `viewer`
   roles. Replace both UUID placeholders with the corresponding Supabase Auth
   user IDs before running it.
3. `003_playlists.sql` adds saved playlists. Admins can create and delete
   them; viewers can read a playlist only while its video is published. Safe to
   rerun. Until it has been run, the app works but cannot save playlists.
4. `004_teams.sql` adds teams, squad members (players and staff) and a team
   on each video. Admins manage them in the Teams tab; viewers can read team
   names and players, never staff. Admins can delete a team (and its squad)
   once no videos use it. Structure only: keep real squad lists out of the
   repository. Safe to rerun.

The viewer role can read published videos only. The admin role can read and
manage all videos. Database row-level security enforces these permissions.

Never put passwords, Supabase secret/service-role keys, or real user credentials
in these files or commit them to the repository.
