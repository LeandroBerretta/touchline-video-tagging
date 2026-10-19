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
5. `005_users.sql` lets the `admin-users` Edge Function (the Users tab) read
   and set roles. Run it before using the Users tab. Safe to rerun.

## Users tab: the admin-users Edge Function (one-time setup)

Creating and removing accounts needs Supabase's service-role key, which must
never be in the web page. The Users tab therefore calls a small Supabase Edge
Function, `supabase/functions/admin-users/index.ts`, which runs on Supabase's
servers. Supabase gives every Edge Function the project URL and service-role
key automatically, so nothing secret is copied anywhere. The function only
acts for a signed-in user whose role is `admin`, and it never lets an admin
remove their own account or take away their own admin role.

1. Run `database/005_users.sql` in the SQL Editor.
2. In the Supabase dashboard open **Edge Functions** and choose **Deploy a new
   function › Via editor**.
3. Name it exactly `admin-users`.
4. Replace the example code with the whole of
   `supabase/functions/admin-users/index.ts` and choose **Deploy function**.
   Leave **Verify JWT** on (the default): only signed-in users can call it.
5. In **Authentication › URL Configuration**, make sure the site's address
   (and `http://localhost:3000/` for local use) is in the redirect URLs: invite
   and password-reset emails send people back there.
6. Reload Touchline and open the **Users** tab.

To change the invite email's wording, edit **Authentication › Emails › Invite
user**. Supabase's built-in email service sends only a few emails per hour; for
more, set up your own SMTP server under **Authentication › Emails › SMTP
Settings**. After a code change to the function, paste and deploy it again.

The viewer role can read published videos only. The admin role can read and
manage all videos. Database row-level security enforces these permissions.

Never put passwords, Supabase secret/service-role keys, or real user credentials
in these files or commit them to the repository.
