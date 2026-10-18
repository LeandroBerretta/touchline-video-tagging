# Touchline use-case flows

This document describes how people use Touchline, as implemented in
`public/app.js`. Each section has a diagram (Mermaid, rendered by GitHub) and
the rules the UI enforces at each step.

## Actors and use cases

| Actor | Use cases |
| --- | --- |
| Anyone with an account | UC1 Sign in, UC8 Sign out, UC9 Reset a forgotten password |
| Admin | UC2 Tag a video, UC3 Edit or delete a moment, UC4 Save and publish, UC5 Reopen a saved video, UC6 Remove a video, UC7 Watch (published only) |
| Viewer | UC7 Watch a published video |
| Supabase | Authenticates users, returns the role, stores videos, enforces row-level security |
| Vimeo | Hosts and plays the video inside an embedded player |

```mermaid
flowchart LR
  admin([Admin])
  viewer([Viewer])
  subgraph Touchline
    UC1[UC1 Sign in]
    UC2[UC2 Tag a video]
    UC3[UC3 Edit or delete a moment]
    UC4[UC4 Save and publish]
    UC5[UC5 Reopen a saved video]
    UC6[UC6 Remove a video]
    UC7[UC7 Watch a published video]
    UC8[UC8 Sign out]
    UC9[UC9 Reset a forgotten password]
  end
  admin --- UC1 & UC2 & UC3 & UC4 & UC5 & UC6 & UC7 & UC8 & UC9
  viewer --- UC1 & UC7 & UC8 & UC9
```

## UC1 Sign in and role routing

Accounts are created in Supabase by the administrator; there is no sign-up
screen. A signed-in account with no row in `app_users` is signed out again.

```mermaid
flowchart TD
  A[Open the site] --> B{"config.js has URL and key?"}
  B -- No --> B1[Login card shows 'Supabase is not configured']
  B -- Yes --> C{Existing session?}
  C -- Yes --> F
  C -- No --> D[Login card: email + password]
  D --> E[Supabase password sign-in]
  E -- Error --> D1["Plain-language error, e.g. 'The email or password is incorrect.'"] --> D
  E -- OK --> F[Read role from app_users]
  F --> G{Role}
  G -- None --> G1[Sign out and show 'This account does not have an app role'] --> D
  G -- admin --> H[Show Tag and Watch tabs, open Tag tab]
  G -- viewer --> I[No tab bar, open Watch view]
  H & I --> J[Load the cloud library]
```

Repeat Supabase events for the same user (token refresh, tab refocus) are
ignored, so they do not reset the tab or reload the library.

## UC2 Tag a video (admin)

```mermaid
flowchart TD
  A[Tag tab] --> B[Click '+ New video' or use the empty form]
  B --> C[Enter video name and Vimeo link]
  C --> Q{Tag now?}
  Q -- "No: Add to queue" --> Q1[Saved with no moments; listed under Not started, oldest first] --> B
  Q -- Yes --> D[Open video]
  D --> E{Valid https Vimeo link?}
  E -- No --> E1[Show link error] --> C
  E -- Yes --> F[Embed Vimeo player]
  F --> G{Player ready?}
  G -- No --> G1[Show 'Could not open this Vimeo video'] --> C
  G -- Yes --> H[Mark moment enabled]
  H --> I[Watch; press Mark moment or Enter]
  I --> J["Moment added in match order, at current time minus the chosen offset (default 3 s)"]
  J --> K{Pick a type}
  K -- Quick button --> L[Type set, focus moves to player names]
  K -- Dropdown --> L
  K -- Later --> M[Moment stays highlighted as 'Needs an event type']
  L --> N[Optional player names with suggestions, and a note]
  N & M --> O{More moments?}
  O -- Yes --> I
  O -- No --> P[UC4 Save and publish]
```

Notes:

- Quick types: letter keys Q W E R T Y (up to U I O, in the order ticked; chosen per device under
  Tagging options) and matching buttons mark a moment with that type in one
  press; it is complete, so it goes straight to Done. Right after any mark,
  Shift + shirt number (added when Shift is released) or number + Enter adds
  that squad player, and Backspace undoes the mark
  (shown in the "Last" bar). An option pauses the video on each mark.
- Review pass: with the video paused, Done moves to the next To do moment and
  seeks there. To do moments can be ticked and edited together (type, player,
  Done, delete).
- Keyboard: Enter marks, Space plays or pauses, ← and → jump 5 seconds. Keys
  only work while the page has focus, so playback has its own controls under
  the video; clicking inside the Vimeo picture hands the keyboard to Vimeo.
- Full screen (under the video) fills the screen with the video and the
  moments list together. Vimeo's own full screen is disabled in this view
  because it would hide the tagging controls. Hide library widens the video.
- Zoom (under the video, in Tag and Watch) magnifies the player up to 400%.
  While zoomed, drag pans, the wheel zooms towards the pointer and a click
  plays or pauses; keys + / − / 0 zoom in, out and reset in Tag. It scales the
  Vimeo player box, so close-ups may look soft and Vimeo's controls are hidden.
- The mark offset (0, 3, 5 or 10 seconds earlier) is remembered in this browser.
- Clicking a moment's timestamp plays the video from that point.
- Player-name suggestions come from names already used in the library.

## Moment lifecycle

Moments are split into a **To do** list (match order) and a **Done** list,
grouped by event type in the order of the event-type list, with custom
"Other" names last. Each group starts folded; click its name to open it. A moment is complete as soon
as it has an event type (for "Other", also a custom name); the admin then
ticks it off with **✓ Done** (or Enter in its player or note field). The
stored record keeps `completed` and `done` flags on each moment. Incomplete
moments are always saved, but the Watch view never shows them. Moments saved
before the Done list existed count as done if they have a type.

```mermaid
stateDiagram-v2
  [*] --> NeedsType: Mark moment
  NeedsType --> Typed: Choose a type
  Typed --> NeedsType: Clear the type
  Typed --> Done: ✓ Done (or Enter in a text field)
  Done --> Typed: Move back to To do / Undo
  Done --> NeedsType: Clear the type
  Done --> Done: Change type (moves group), edit players, note or time
  NeedsType --> Deleted: Delete (×)
  Typed --> Deleted: Delete (×)
  Done --> Deleted: Delete (×)
  Deleted --> [*]
  note right of Typed: NeedsType and Typed are shown in To do
```

## UC3 Edit or delete a moment (admin)

```mermaid
flowchart TD
  A[Moments list] --> B{Action}
  B -- Change type, players or note --> C[Saved in the page at once; 'Unsaved changes' shown]
  B -- Click timestamp --> D[Player seeks to the moment]
  B -- Edit under the timestamp --> T{New time}
  T -- "Type mm:ss or h:mm:ss, Set time" --> T1[Moment moves, list re-sorts, player seeks there]
  T -- Use video time --> T1
  T -- Cancel or Esc --> A
  B -- × --> E[Moment removed; notice offers Undo]
  B -- "Delete all (To do or Done heading)" --> DA{Confirm?}
  DA -- No --> A
  DA -- Yes --> E2[Every moment in that list removed; notice offers Undo for all]
  E --> F{Undo clicked?}
  F -- Yes --> G[Moment restored in match order]
  F -- No --> H[Removed when the video is next saved]
```

## UC4 Save and publish (admin)

Moments without an event type never block saving or publishing. They are
stored, and the hint under the buttons says how many are hidden from viewers,
for example "2 moments without an event type are saved but hidden from viewers
until they have one."

```mermaid
flowchart TD
  A[Ready to save] --> B{Video status}
  B -- New or In progress --> C{Choose}
  C -- Save progress --> D[Store as In progress, hidden from viewers]
  C -- Publish video --> F[Store as Published, visible to viewers]
  B -- Published --> G{Choose}
  G -- Re-publish changes --> F
  G -- Unpublish --> U{Confirm?}
  U -- No --> A
  U -- Yes --> D2["Store as In progress (open edits included), hidden from viewers"]
  F --> F1[Viewers see only moments that have an event type]
  D & D2 & F1 --> H[Reload library lists]
```

```mermaid
stateDiagram-v2
  [*] --> New: Open video
  New --> InProgress: Save progress
  New --> Published: Publish video
  InProgress --> InProgress: Save progress
  InProgress --> Published: Publish video
  Published --> Published: Re-publish changes
  Published --> InProgress: Unpublish (editor or library)
  InProgress --> [*]: Remove
  Published --> [*]: Remove
```

A published video can be unpublished from the editor (next to Re-publish
changes) or straight from its Published library entry without opening it.
Either way it asks for confirmation and moves the video back to In progress;
from the editor, any unsaved edits are saved with it.

## UC5 Reopen a saved video (admin)

```mermaid
flowchart TD
  A[Library: Not started, In progress or Published list] --> B[Click a video]
  B --> C{Unsaved changes?}
  C -- Yes --> D{Confirm discard?}
  D -- No --> A
  D -- Yes --> E
  C -- No --> E[Fill name and link, open player]
  E --> F[Library entry highlighted as the open video]
  F --> G[Stored moments load into the list, incomplete ones highlighted]
  G --> H[Continue with UC2, UC3, UC4]
```

## UC6 Remove a video (admin)

```mermaid
flowchart TD
  A[Click Remove next to a library entry] --> B{Is it the open video with unsaved changes?}
  B -- Yes --> C{Confirm discard?}
  C -- No --> Z[Cancel]
  B -- No --> D
  C -- Yes --> D{"Confirm 'This cannot be undone'"}
  D -- No --> Z
  D -- Yes --> E[Delete row in Supabase]
  E --> F{Deleted?}
  F -- No --> F1[Show error]
  F -- Yes --> G[Remove from library; if it was open, reset the editor]
```

## UC7 Watch a published video (admin or viewer)

Viewers only ever receive published rows; this is enforced by Supabase
row-level security, not only by the UI.

```mermaid
flowchart TD
  A[Watch view] --> B[Select a published video]
  B --> C[Embed Vimeo player; list events in folded groups by event type]
  C --> D{Player ready?}
  D -- No --> D1[Show error, play buttons stay disabled]
  D -- Yes --> E{Action}
  E -- "▶ Play on one group" --> P[Playlist: that type's clips in match order]
  E -- "Tick whole types and/or single events, ▶ Play selected" --> P2[Playlist: every ticked event in match order]
  P & P2 --> Q["Each clip: 3 s before the moment, for the clip length (default 20 s)"]
  Q --> R{During playback}
  R -- Clip ends --> S{More clips?}
  S -- Yes --> Q
  S -- No --> T[Pause; 'Finished all n clips'] --> E
  R -- "Previous / Next" --> Q
  R -- "Stop, or move the video by hand" --> E
  E -- Open a group, click an event --> H[Play from 3 s before the moment] --> E
  E -- Watch whole video --> G[Seek to 0:00 and play] --> E
  E -- Tagged moments only --> TM[Playlist of every tagged moment except markers, in match order] --> Q
```

Notes:

- "Tagged moments only" skips the dead time: it plays every event (not
  Start of game, Half-time or End of game) back to back at the current clip
  length, and its button shows the running time, counting overlapping clips once.

- Groups follow the event-type list order (custom types last) and start folded.
- Every event has its own tick box; a group's tick box selects all its events
  and shows a partly-ticked state (count like `2/8`) when only some are picked.
- Clip length is 5, 10, 15, 20, 30 or 45 seconds, remembered per browser. Changing
  it during a playlist applies from the next clip.
- Overlapping clips run on without jumping back; the playing event is
  highlighted and the playlist bar shows "clip n of total".

### Stats

The **Stats** view (Events | Stats switch in Watch, for admins and viewers)
counts the video's events by type and by player. If a **Half-time** moment
exists, the event table splits into 1st half, 2nd half and total; otherwise it
shows totals only. Start of game, Half-time and End of game are markers and are
never counted. Player names are split on commas and matched ignoring case and
extra spaces; a moment naming two players counts for both. Every count plays
its clips back to back.

New videos (opened new in Tag or added to the queue) get a Start of game moment
at 00:10 automatically, already in Done; it can be moved with Edit. Markers do
not move a video out of Not started.

### Saved playlists

Admins can save the ticked clips as a playlist with a title, an optional note
and the current clip length (needs `database/003_playlists.sql`). Viewers can
read a playlist only while its video is published; this is enforced by
row-level security.

```mermaid
flowchart TD
  A[Admin ticks clips in Watch] --> B[Save as playlist: title, note]
  B --> C[Playlist listed under Playlists for that video]
  C --> D[Copy link: site address + #playlist-id]
  D --> E[Someone opens the link]
  E --> F{Signed in?}
  F -- No --> G[Sign in] --> H
  F -- Yes --> H{Playlist exists and video published?}
  H -- No --> H1[Message: link no longer works]
  H -- Yes --> I[Watch opens on the video, playlist highlighted]
  I --> J[Press Play: clips back to back, coach's note shown]
```

## Teams and squads (admin)

Needs `database/004_teams.sql`. Each video belongs to one team (chosen in the
video form; automatic when there is only one team). The Teams tab lists teams;
for the selected team admins rename it, add, edit and remove players (shirt
number and name) and staff (name and role). Removing keeps the person
(inactive) so old moments and stats still show them; they can be restored.
A team can be deleted, together with its squad, once no videos belong to it;
until then the app explains how many videos to move or remove first.
Viewers can read team names and players, never staff.

When tagging, players are picked from the video's squad as chips; "Other
name…" adds free-text names such as opponents. Typed names that match the
squad become squad players. Moments saved before squads existed are linked to
squad players by name when opened. Stats count squad players by identity and
show their shirt numbers.

```mermaid
flowchart TD
  A[Teams tab] --> B{Team exists?}
  B -- No --> C[Add team]
  B -- Yes --> D[Select team]
  C --> D
  D --> E[Add / edit / remove players and staff]
  E --> F[Tag view: video form Team]
  F --> G[Moment: Add player… picks from squad]
  G --> H[Saved as player ids + names]
  H --> I[Watch Stats by player, with shirt numbers]
```

## UC8 Sign out

```mermaid
flowchart TD
  A[Click Sign out] --> B{Unsaved changes?}
  B -- Yes --> C{Confirm discard?}
  C -- No --> Z[Stay signed in]
  B -- No --> D
  C -- Yes --> D[Supabase sign-out]
  D --> E[Clear state, close players, show login card with 'Signed out.']
```

## UC9 Reset a forgotten password

Requires the site URL to be listed under Supabase **Authentication → URL
Configuration → Redirect URLs**.

```mermaid
flowchart TD
  A[Login card] --> B[Enter email, click 'Forgot password?']
  B --> C{Email entered?}
  C -- No --> C1[Ask for the email first] --> A
  C -- Yes --> D[Supabase sends a reset link]
  D --> E[User opens the link on this device]
  E --> F[Site opens and shows 'Choose a new password']
  F --> G{Passwords match and are 8+ characters?}
  G -- No --> G1[Show the problem in the dialog] --> F
  G -- Yes --> H[Supabase updates the password]
  H --> I[Dialog closes, user continues signed in]
```
