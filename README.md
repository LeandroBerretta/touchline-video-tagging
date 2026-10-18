# Touchline — Vimeo video tagging

Touchline is a small web app for tagging moments in Vimeo-hosted videos. GitHub
Pages serves the site, and Supabase provides sign-in, role permissions, and the
cloud video library. The videos remain hosted by Vimeo.

## Accounts and access

- The `admin` account can tag, save, publish, edit, and remove videos.
- The `viewer` account can watch published videos and their tagged moments.
- Supabase Auth signs users in. Row Level Security in the database enforces the
  roles; hiding editing controls in the page is not the security boundary.
- The viewer account can be shared, but everyone using it shares one login and
  activity is not attributable to an individual.

## Supabase setup

1. Create the database and permissions by running `database/001_schema.sql` in
   the Supabase SQL Editor. The script is safe to rerun and adds `published_at`
   if the table was created from an earlier version.
   Then run `database/003_playlists.sql` to enable saved, shareable
   playlists.
2. Create one admin and one viewer in **Authentication → Users**.
3. Copy their Auth user IDs into `database/002_assign_roles.sql` and run it.
   Never add passwords or secret/service-role keys to the repository.
4. In Supabase **Authentication → URL Configuration**, set the Site URL to the
   deployed Pages URL and allow that URL plus the local development URL as
   redirect URLs. For a project site, the deployed URL usually includes the
   repository name, such as `https://OWNER.github.io/REPOSITORY/`. The
   **Forgot password?** link on the sign-in card sends users back to this URL,
   so the reset email only works for URLs on that list.

The cloud library starts empty. The old local JSON library in `data/` is not
automatically imported; it is left on disk as local data.

## Run locally

With Node.js 24 installed:

```sh
npm install
Copy-Item public/config.example.js public/config.js
```

Edit `public/config.js` and enter the Supabase **Project URL** and **Publishable
key**. These are public client settings; never use a service-role/secret key.
The config file is ignored by Git.

Then run:

```sh
npm run dev
```

Open <http://localhost:3000>. Sign in with either Supabase account. The Vimeo
player also needs internet access and the video's Vimeo privacy/embed settings
must allow it to play on the page.

## Deploy to GitHub Pages

The workflow at `.github/workflows/pages.yml` publishes the static app whenever
you push to `main`. In the GitHub repository:

1. Add repository **Actions secrets** named `SUPABASE_URL` and
   `SUPABASE_PUBLISHABLE_KEY`. Use the Supabase Project URL and Publishable key.
   The publishable key is intended for browsers; do not add a service-role or
   secret key.
2. Under **Settings → Pages**, choose **GitHub Actions** as the build and
   deployment source.
3. Push the workflow and app files to `main`. Check the repository's **Actions**
   tab for a successful deployment.

On GitHub Free, Pages requires a public repository. The source code will be
public, so keep credentials and private video data out of the repository. The
database remains protected by Supabase Auth and row-level security.

Supabase's free plan has usage limits and may pause projects after inactivity.
See [Supabase pricing](https://supabase.com/pricing) for current plan details.
