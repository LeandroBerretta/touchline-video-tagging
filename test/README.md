# Touchline tests

Run everything with:

```sh
npm test
```

This type-checks the server, then runs every `test/*.test.js` file with Node's
built-in test runner. It takes under a minute.

The suite also runs automatically:

- **Before every push**: `.githooks/pre-push` runs `npm test` and cancels the
  push if anything fails. `npm install` points git at that folder (the
  `prepare` script); run `git config core.hooksPath .githooks` once if you
  cloned without installing.
- **Before every deploy**: the GitHub Pages workflow runs `npm test`, so a
  failing build never goes live.

## How the tests work

Each test loads the real `public/index.html` and `public/app.js` into a
simulated browser ([jsdom](https://github.com/jsdom/jsdom)) with two
stand-ins:

- `helpers/fake-supabase.js`: an in-memory database and sign-in service. It
  follows the same access rules as the real database: viewers only see
  published videos, players (never staff) and playlists of published videos;
  only admins can write; deleting a team removes its squad.
- `helpers/fake-vimeo.js`: a video player whose clock the test controls
  (`player.advance(seconds)`), firing the same events as Vimeo's.

`helpers/app.js` starts the page (`startApp({ as: "admin" | "viewer" | null,
tables })`) and returns helpers to click, type, press keys
(`press("e")`, `shiftNumber("9")`), open videos and read the page. All of
`app.js`'s top-level functions and its `state` are available as `page.app` and
`page.state`. `fixtures.js` holds the shared test data: one team with a
made-up squad and three videos (In progress, Published, Not started).

Autosave timers never fire on their own in tests; a test checks that a save
was scheduled (`state.autosaveTimer`) and then runs it with
`page.app.autosave()`.

## What is covered

| File | Covers |
| --- | --- |
| `unit.test.js` | Time formats, Vimeo links, completeness, saving shape, player matching, durations, error messages |
| `auth.test.js` | UC1 sign-in and role routing, UC8 sign-out (including offline), UC9 password reset |
| `tagging.test.js` | UC2/UC3: marking, quick keys, Shift + shirt number, undo, Done, Other, times, players, bulk edit, Delete all, Match order, timeline, Keys ?, keys-paused bar, tagging options, zoom |
| `saving.test.js` | UC4: save, publish, re-publish, unpublish (editor and library), changed links, autosave and its failures |
| `library.test.js` | UC5/UC6: sections, queue, reopening, broken moments, remove, search, team filter |
| `teams.test.js` | Teams and squads: members, numbers, remove/restore, edits, delete rules, viewer limits |
| `watch.test.js` | UC7: video cards, groups, back-to-back clips, Choose clips and its type/player filters, Tagged moments only, clip length, timeline, stats |
| `playlists.test.js` | Saved playlists: save, play, copy link, open from a link, delete, missing table |
| `live.test.js` | UC10 Live mode: start, quick types and shirt numbers, More types, no signal, half-time and end, reload, Waiting for video, attach, line up (kick-off, both halves, on-screen clock, nudge) |
| `users.test.js` | Users tab: list, search, invite, resend, change role, password reset, remove, self-protection, setup message, invite-link welcome |
| `static.test.js` | Page/code consistency, database access rules, no secrets or squad data committed, workflow and docs |

## Adding a test

Add it to the file for that part of the app, starting from `startApp`. When
a bug is fixed, add a test that would have caught it and mark it
"(regression)" in its name.
