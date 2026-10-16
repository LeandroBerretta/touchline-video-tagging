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
  C --> D[Open video]
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

- Keyboard: Enter marks, Space plays or pauses, ← and → jump 5 seconds. Keys
  only work while the page has focus, so playback has its own controls under
  the video; clicking inside the Vimeo picture hands the keyboard to Vimeo.
- Full screen (under the video) fills the screen with the video and the
  moments list together. Vimeo's own full screen is disabled in this view
  because it would hide the tagging controls. Hide library widens the video.
- The mark offset (0, 3, 5 or 10 seconds earlier) is remembered in this browser.
- Clicking a moment's timestamp plays the video from that point.
- Player-name suggestions come from names already used in the library.

## Moment lifecycle

There is one list of moments, in match order. A moment is complete as soon as
it has an event type (for "Other", also a custom name). The stored record
keeps a `completed` flag on each moment. Incomplete moments are always saved,
but the Watch view never shows them.

```mermaid
stateDiagram-v2
  [*] --> NeedsType: Mark moment
  NeedsType --> Complete: Choose a type
  Complete --> NeedsType: Clear the type
  Complete --> Complete: Edit players, note or time
  NeedsType --> NeedsType: Edit time
  NeedsType --> Deleted: Delete (×)
  Complete --> Deleted: Delete (×)
  Deleted --> NeedsType: Undo (incomplete moment)
  Deleted --> Complete: Undo (complete moment)
  Deleted --> [*]
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
  B -- Published --> G[Only 'Re-publish changes' is offered]
  G --> F
  F --> F1[Viewers see only moments that have an event type]
  D & F1 --> H[Reload library lists]
```

```mermaid
stateDiagram-v2
  [*] --> New: Open video
  New --> InProgress: Save progress
  New --> Published: Publish video
  InProgress --> InProgress: Save progress
  InProgress --> Published: Publish video
  Published --> Published: Re-publish changes
  InProgress --> [*]: Remove
  Published --> [*]: Remove
```

There is currently no way to move a published video back to In progress.

## UC5 Reopen a saved video (admin)

```mermaid
flowchart TD
  A[Library: In progress or Published list] --> B[Click a video]
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
  B --> C[Embed Vimeo player and list events in match order]
  C --> D{Player ready?}
  D -- No --> D1[Show error, events stay disabled]
  D -- Yes --> E{Action}
  E -- Filter by event type or player --> F[List narrows, count shows 'n of total'] --> E
  E -- Watch whole video --> G[Seek to 0:00 and play] --> E
  E -- Click an event --> H[Play from 3 s before the moment] --> E
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
