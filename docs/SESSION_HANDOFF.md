# Touchline project handoff

Last updated: 2026-10-15

This note captures the current state of the Touchline app, the decisions that matter for future work, and what has already been implemented in this clone. It is meant to help the next session continue without re-discovering old setup work.

## Project and working folders

- GitHub repository: `LeandroBerretta/touchline-video-tagging`
- Local workspace: `C:\Users\TeamLeandro\OneDrive\Desktop\MyProjects\repo\touchline-video-tagging`
- Earlier source folder: `C:\Users\TeamLeandro\OneDrive\Desktop\MyProjects\repo\MySportsAnalyzer`
- Use the clone above for any future GitHub work. Do not assume the source folder and the clone stay in sync.
- The repository currently sits on `main` and contains the current app implementation, not a copy of the original local JSON project.

## Product direction

- Build a lightweight static front end served by GitHub Pages.
- Use Supabase for authentication, role checks, and the cloud library.
- Keep Vimeo as the video host; the app only loads the Vimeo player and stores metadata/URLs in Supabase.
- Support two roles:
  - `admin`: can tag, save, publish, edit, and remove videos.
  - `viewer`: can only watch published videos and read their completed moments.
- The cloud library starts empty by design; the old local JSON library is not imported into the repo.
- GitHub Pages requires a public repo on the Free plan, so the project must not depend on private credentials in frontend code or repo files.
- Supabase Free projects have quota limits and may pause after inactivity. Do not promise always-on operation.

## Current implementation state

This clone already includes the core cloud-library flow and admin/viewer split that earlier notes were still targeting.

- `public/index.html`
  - Adds the sign-in screen, session label, and sign-out button.
  - Shows the app shell only after the user has a valid app role.
  - Provides the tag workspace with saved library lists, completed-events UI, and watch tab.
- `public/app.js`
  - Uses `@supabase/supabase-js` directly from the browser.
  - Reads the public Supabase Project URL and Publishable key from `window.TOUCHLINE_CONFIG`.
  - Signs in via Supabase password auth and loads the user role from `public.app_users`.
  - Loads and renders the cloud library from `public.videos`.
  - Saves and publishes videos using Supabase `upsert`, and removes videos with `delete`.
  - Allows admins to open a Vimeo video, mark timestamps, and assign event types in a single list of moments in match order.
  - A moment is complete once it has an event type; incomplete moments are highlighted and can be saved as progress, but block publishing.
  - Keeps viewer access read-only in the UI and relies on database RLS as the security boundary.
- `public/styles.css`
  - Styles the login card, library cards, event rows, completed-events UI, and watch tab.
- `public/config.example.js`
  - Blank template for the browser-side config.
- `public/config.js`
  - Local private config, ignored by Git. It contains the public Project URL and Publishable key. Never read, print, stage, or commit it.
- `.gitignore`
  - Ignores `public/config.js`, `.env*`, dependency output, build output, and local data.
- `src/server.ts`
  - Serves the local static app and exposes the config file when present; it does not provide the old JSON-library API.
- `database/001_schema.sql`
  - Creates `app_users` and `videos`, enables RLS, grants the needed privileges, and defines the `published_at` column.
- `database/002_assign_roles.sql`
  - Template for assigning the admin and viewer roles to the real Supabase Auth user IDs.
- `.github/workflows/pages.yml`
  - Publishes the static site to GitHub Pages. It writes `dist/site/config.js` from `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`.
- `README.md`
  - Documents the current setup and deployment flow.

## Current data model and key behavior

`public.app_users`

- `user_id uuid` references `auth.users(id)`.
- `role` is restricted to `admin` or `viewer`.
- Authenticated users can only read their own role row.
- The browser never changes roles directly; RLS is the authority.

`public.videos`

- `id uuid` primary key
- `name text`, `vimeo_url text`
- `status` is `in_progress` or `published`
- `tags jsonb` is stored as an array of event objects
- `created_at`, `updated_at`, `published_at` timestamps
- RLS allows admin writes and viewer reads only for published records

The app stores event objects in the JSON as tag records, including things like:

- `id`
- `timestampSeconds`
- `eventType`
- `customEventType`
- `playerNames`
- `note`
- `completed` (boolean, written on every save)

`completed` is true when the moment has an event type (and, for `other`, a custom name). The UI recomputes it from those fields, so older records without the flag still work. In-progress records may contain incomplete moments; publishing requires every moment to be complete, and the Watch view only lists complete moments.

Use-case flow diagrams are in `docs/USE_CASE_FLOWS.md`.

## Verified status and limits

- `npm run build` passed in the current clone.
- `node --check public/app.js` passed.
- The app loads the login screen and the static local dev server without a config file.
- Browser sign-in and role loading were confirmed after setting the correct Supabase Project URL.
- The live GitHub Pages deployment has not been fully validated yet. The workflow and repo settings still need confirmation.
- Production deployment verification is still outstanding.

## Current work items and follow-up tasks

1. Test the reworked tagging flow, the Watch filters, and the password reset in a browser with real admin and viewer accounts (not yet done).
2. Confirm the GitHub repository visibility and Pages settings are compatible with GitHub Free.
3. Add the required `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` secrets in GitHub Actions and confirm the workflow deploys successfully.
4. Validate the production site with both admin and viewer accounts. Ensure viewer-only access is enforced by Supabase RLS, not just by hidden buttons.
5. Check that `public/config.js` stays absent from `git status` and never gets committed.
6. Keep local video files and local library data out of the repository.

## Recent UI changes completed in this session

- Reordered the tag workspace so Unassigned moments appears above Completed events.
- Fixed the completed-events bug where incomplete items were leaking into the completed section because the UI treated a missing player name as a failed assignment.
- Updated the completed-event selector to display timestamp-only labels when no player name exists, and `timestamp · player` when a player name is present.
- Changed the completed-event detail behavior so the selected item shows its full editor below the dropdown instead of rendering every saved item at once.
- Kept the selected completed item in sync with the dropdown and allowed the user to edit or delete the currently selected event directly from the details panel.
- Verified the app still builds after these UI fixes.

## Usability rework (2026-10-15, later session)

- Replaced the Unassigned/Completed split and the per-event Save buttons with one list of moments in match order. Saving is now "Save progress" (incomplete moments allowed) and "Publish video" (all moments need a type).
- Published videos only offer "Re-publish changes", because any save of a published row is visible to viewers.
- Supabase auth events for the same user no longer re-run sign-in setup (no tab reset on token refresh).
- Added a hint under the save buttons explaining why they are disabled, quick event-type buttons, a "mark N seconds earlier" setting (default 3 s, remembered per browser), player-name suggestions, Undo after deleting a moment, and a highlight on the open library video.
- Watch view: playback starts 3 s before each moment, events can be filtered by type and player, and viewers no longer see a one-tab bar.
- Added "Forgot password?" with a set-password dialog, plain-language error messages, larger text and tap targets, a bottom notice bar on narrow screens, and the library below the video on phones.
- Pinned `@supabase/supabase-js` to 2.45.4.

## Safety notes

- Never read or print `public/config.js`.
- Never add Supabase service-role or database-secret values to frontend code or build-time env settings.
- Publishable key and Project URL are browser-safe public settings; the database must remain protected by RLS.
- Keep all local media and local library data out of GitHub.
- Any future event-taxonomy changes should remain simple and usable in the UI; do not introduce an over-engineered classification system.

## Reminder for the next session

The clone includes the admin/viewer flow, cloud library, a single-list tagging workflow with a persisted `completed` flag, and filtered watch playback. The most important things to do next are a browser test with real accounts and verifying the GitHub Pages deployment.
