// Saved, shareable playlists: save, list, copy link, open from a link, delete, missing table.
import { test } from "node:test";
import assert from "node:assert/strict";
import { startApp, settle } from "./helpers/app.js";
import { standardTables, PUBLISHED_ID } from "./fixtures.js";

const PLAYLIST_ID = "ffffffff-0000-4000-8000-000000000001";

function tablesWithPlaylist() {
  const tables = standardTables();
  tables.playlists = [{ id: PLAYLIST_ID, video_id: PUBLISHED_ID, title: "Nine: finishing", note: "Watch the first touch.", tag_ids: ["p-goal1", "p-corner"], clip_seconds: 10, created_at: "2026-10-15T10:00:00Z" }];
  return tables;
}

test("an admin saves ticked clips as a playlist with a title, note and clip length", async () => {
  const page = await startApp({ tables: standardTables() });
  await page.tab("watch");
  await page.openInWatch("Test FC vs Okanagan");
  await page.choose("#clipLength", "15");
  await page.click("#chooseClipsButton");
  const box = page.$('.watch-event-pick[data-tag-id="p-goal2"]');
  box.checked = true;
  box.dispatchEvent(new page.window.Event("change", { bubbles: true }));
  await settle();
  await page.click("#savePlaylistButton");
  assert.equal(page.$("#playlistDialog").open, true);
  assert.match(page.text("#playlistDialogSummary"), /1 clip from Test FC vs Okanagan, 15 seconds each/);
  page.$("#playlistTitle").value = "Late winner";
  page.$("#playlistNote").value = "Look at the run.";
  page.$("#playlistForm").dispatchEvent(new page.window.Event("submit", { bubbles: true, cancelable: true }));
  await settle(6);
  const saved = page.db.playlists.find((row) => row.title === "Late winner");
  assert.deepEqual(saved.tag_ids, ["p-goal2"]);
  assert.equal(saved.clip_seconds, 15);
  assert.equal(saved.note, "Look at the run.");
  assert.ok(page.texts(".saved-playlist-title").includes("Late winner"));
  page.close();
});

test("a playlist plays with its own clip length and shows the coach's note", async () => {
  const page = await startApp({ as: "viewer", tables: tablesWithPlaylist() });
  await page.openInWatch("Test FC vs Okanagan");
  await page.click(page.$(".saved-playlist .watch-group-play"));
  assert.deepEqual(page.state.playlist.clips.map((clip) => clip.tag.id), ["p-goal1", "p-corner"]);
  assert.equal(page.state.playlist.clips[0].end - page.state.playlist.clips[0].start, 10);
  assert.equal(page.text("#playlistNoteText"), "Watch the first touch.");
  page.close();
});

test("Copy link gives a link that opens Watch on that video with the playlist highlighted", async () => {
  const page = await startApp({ tables: tablesWithPlaylist() });
  await page.tab("watch");
  await page.openInWatch("Test FC vs Okanagan");
  await page.click(page.$(".saved-playlist .link-button"));
  assert.equal(page.dialogs.copied, `http://localhost/touchline/#playlist-${PLAYLIST_ID}`);
  page.close();

  const viewer = await startApp({ as: "viewer", tables: tablesWithPlaylist() });
  viewer.window.location.hash = `#playlist-${PLAYLIST_ID}`; // the browser fires hashchange itself
  viewer.window.dispatchEvent(new viewer.window.HashChangeEvent("hashchange")); // and a duplicate must be harmless
  await settle(14);
  assert.equal(viewer.state.selectedWatchId, PUBLISHED_ID);
  assert.ok(viewer.$(`.saved-playlist[data-playlist-id="${PLAYLIST_ID}"]`).classList.contains("linked"));
  assert.match(viewer.text("#watchNotice"), /Playlist from your coach: "Nine: finishing"/);
  viewer.close();
});

test("a link to a deleted playlist or unpublished video explains itself", async () => {
  const page = await startApp({ as: "viewer", tables: standardTables() });
  page.window.location.hash = `#playlist-${PLAYLIST_ID}`;
  page.window.dispatchEvent(new page.window.HashChangeEvent("hashchange"));
  await settle(10);
  assert.match(page.text("#watchNotice"), /link doesn't work any more/);
  page.close();
});

test("viewers can't save or delete playlists", async () => {
  const page = await startApp({ as: "viewer", tables: tablesWithPlaylist() });
  await page.openInWatch("Test FC vs Okanagan");
  assert.equal(page.$("#savePlaylistButton").hidden, true);
  assert.equal(page.$$(".saved-playlist .delete-all").length, 0);
  page.close();
});

test("an admin deletes a playlist after confirming", async () => {
  const page = await startApp({ tables: tablesWithPlaylist() });
  await page.tab("watch");
  await page.openInWatch("Test FC vs Okanagan");
  await page.click(page.$(".saved-playlist .delete-all"));
  await settle(6);
  assert.match(page.dialogs.confirms.at(-1), /Links to it will stop working/);
  assert.equal(page.db.playlists.length, 0);
  page.close();
});

test("without the playlists table, the app still works and tells admins what to run", async () => {
  const page = await startApp({ tables: standardTables() });
  page.supabase.fail("playlists", "select", "relation \"public.playlists\" does not exist");
  await page.app.loadLibrary();
  await page.tab("watch");
  await page.openInWatch("Test FC vs Okanagan");
  assert.match(page.text("#savedPlaylists"), /003_playlists\.sql/);
  page.close();
});
