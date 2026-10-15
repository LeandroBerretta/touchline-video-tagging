# Touchline — Vimeo video tagging

Touchline is a small local web app for tagging moments in Vimeo-hosted videos.
Paste a Vimeo link and use **Mark moment** (or press **Enter** while the page is
focused) to capture the current playback time without pausing. If the Vimeo
player has keyboard focus, use the button instead; the embedded player does not
pass keyboard shortcuts to the page. Add an event type and player name(s) to
each timestamp afterward. Select a timestamp to seek back to that moment.

Select **Save to file** to write the video name, Vimeo link, and tags to the
local `data/app-library/videos.json` file. Saved videos appear in **In progress**
or **Published** and can be reopened after closing the browser. Reopening a
video lets you edit its tags and save over the previous file entry, or publish
it again. Publishing changes the entry's status in Touchline; it does not
publish or upload anything to Vimeo. Use **Remove** beside a saved video to
delete its entry and tags from the library file. The video itself remains
hosted by Vimeo; its privacy and embed settings must allow it to play on the
page.

Use the **Watch videos** tab to choose a published match. Select **Watch whole
video** to start at the beginning, or select an event to seek to its timestamp
and play from there.

When using Docker Compose, the library file is stored in
`data/app-library/videos.json` on the host and mounted into the app container.
That file contains the Vimeo links and tags; keep it private. With `npm run
dev`, the app uses the same path in the project folder unless `APP_DATA_DIR` is
set.

## Run locally

With Node.js 24 installed:

```sh
npm install
npm run dev
```

Open <http://localhost:3000>.

For a production build:

```sh
npm run build
npm start
```
