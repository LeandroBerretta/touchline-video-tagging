# Touchline roadmap

Feature ideas from a review of other football video-analysis tools (Hudl
Sportscode and Studio, Nacsport, Veo, Metrica, LongoMatch, Coach Paint) on
2026-10-17. Ordered by value for a club like ours against effort. When one is
done, mark it and pick the next together.

| # | Feature | Status |
| --- | --- | --- |
| 1 | **Saved, shareable playlists with a coach's note.** Save a set of clips with a title and note; anyone with an account opens it from a link. | Shipped 2026-10-17 |
| 2 | **Stats summary per video.** Counts by event type and player, split by half when Half-time is tagged; every count plays its clips. CSV download dropped by decision. | Shipped 2026-10-17 |
| 3 | **Teams and squad list.** Videos belong to a team; admins manage teams, players (with shirt numbers) and staff; tagging picks players from the squad, with Other name for opponents. Stats count players by identity. | Shipped 2026-10-17 |
| 4 | **Pitch location when tagging.** Tap a small pitch diagram to record where an event happened; show simple maps (e.g. shots). Mockup made; open questions: auto-flipping direction at Half-time, which events get a location, who sees the Map. | Shelved 2026-10-17 |
| 5 | **Drawing on a paused frame.** Arrows, circles and freehand saved with a moment and shown when its clip plays. Cannot follow players or be burned into the Vimeo video. | Shelved 2026-10-17 |
| 6 | **Skip dead time.** A one-click "watch only tagged moments" for a whole match (mostly possible today with Select all + Play selected). Built as "Tagged moments only" in Watch, with a running-time estimate. | Shipped 2026-10-17 |
| 7 | **Faster tagging.** One key per event type (marks with its type straight into Done), shirt number + Enter adds a player, Backspace undoes the last mark, optional pause on mark, Done moves to the next To do, edit several To do moments at once, choose your own quick types; Shift + shirt number adds a player. | Shipped 2026-10-17 |
| 8 | **Usability A: protect work.** Autosave In progress videos; a banner when the video has taken the keyboard. | Shipped 2026-10-17 |
| 9 | **Usability B: Tag layout.** Keys behind a ? button, compact moment rows with a Match order view, collapsed video form, timeline markers under the video. Match order is the default view. | Shipped 2026-10-17 |
| 10 | **Usability C: Watch.** Video list instead of a dropdown, simpler play options for viewers, clip length in the playlist bar, pinned playlist bar, phone layout. Built as video cards with a team filter, a Choose clips mode, a shared clip-length row and a sticky / bottom-pinned playlist bar, plus a match timeline under the Watch video. | Shipped 2026-10-17 |
| 11 | **Usability D: Library.** Search and team filter. | Shipped 2026-10-17 |
| 12 | **Live mode.** Tag on the sideline from a phone against the match clock (quick types, More types search, optional shirt numbers, Undo / Change, Half-time and End match); works without signal and sends when back online. After upload, the match waits under Waiting for video; paste the Vimeo link and line the moments up by kick-off, by both kick-offs, or by the clock shown on screen, with a nudge. Not built yet: a prompt when adding a video asking whether it belongs to a live match. | Shipped 2026-10-17; first live game 2026-10-18 went well |
| 14 | **After the first live game.** Open a live match without its video and edit its moments as usual (match time, autosave), then attach the video from a No video yet box. Publish a live match without its video (events and stats at match time; clips once the video is attached and re-published). Pass chain in Live mode and when tagging a video (P starts and counts, L ends): a counter for consecutive passes, ended by Lost it or any other event, with a Passing section in Stats and an editable count. Event types: removed Assist, Carry, Dribble, Tackle, Interception, Block (old moments keep their names); added Break away, Break away pass, Through ball, Chance created, Switch of play, Counter-attack, Ball won, Ball lost, Great play, Coaching point, Pass sequence. | Built 2026-10-18 |
| 15 | **Users page.** Admins invite people by email (admin or viewer), change roles, resend invites, send password resets and remove accounts, through a Supabase Edge Function that holds the service-role key server-side. New people choose their password from the invite email. Individual accounts replace the shared viewer login. | Built 2026-10-19, needs the admin-users function deployed |
| 16 | **Match review changes.** Throw-ins left off the timelines. Minimum pass sequence (default 3; shorter chains dropped, live and video) and Delete pass sequences under N passes. Seconds before by type, live and video, editable in Tagging options (throw-in 3, shots 10, fouls 5, goal 15, cross 7). Foul won / conceded and Hand ball won / conceded replace Foul and Hand ball. Choose clips filter by minimum passes. Stats: average time between pass sequences, per half. Stats view in the Tag screen too (live as you tag, plain numbers). | Built 2026-10-20 |
| 13 | **Voice tagging in Live mode.** Say "Foul seven" or "Shot on target nine" and Live mode adds the event with those shirt numbers, timed from when you started speaking; "undo" and "half-time" too. Hold to talk by default (reliable with sideline noise), optional wake word ("Tag foul seven") for hands-free; the tap buttons stay. Uses the phone browser's speech recognition, which usually needs signal and sends audio to Google or Apple. A later option: record a voice track and transcribe it after the game (works offline, needs a paid transcription service). Build after the first live games show what is slow. | Planned |

## Out of reach with Vimeo embeds

These need the raw video file or camera hardware rather than a Vimeo player:
AI auto-tagging, multiple camera angles, live video inside Touchline (Live
mode tags against the match clock instead), playback faster than 2×,
and drawings that track players automatically.
