// UC4 save and publish, unpublish, and autosave.
import { test } from "node:test";
import assert from "node:assert/strict";
import { startApp, settle } from "./helpers/app.js";
import { standardTables, TEAM, IN_PROGRESS_ID, PUBLISHED_ID } from "./fixtures.js";

const videoInDb = (page, id) => page.db.videos.find((row) => row.id === id);

test("Save progress stores the moments, keeps the video In progress and links its team", async () => {
  const page = await startApp({ tables: standardTables() });
  await page.openNewVideo("Test FC vs Saved");
  page.vimeo.current.time = 500;
  await page.press("e");
  await page.click("#saveVideoButton");
  await settle(6);
  const saved = page.db.videos.find((row) => row.name === "Test FC vs Saved");
  assert.equal(page.state.isDirty, false);
  assert.ok(saved, "row created");
  assert.equal(saved.status, "in_progress");
  assert.equal(saved.team_id, TEAM.id);
  assert.deepEqual(saved.tags.map((tag) => tag.eventType), ["start_of_game", "corner"]);
  assert.ok(saved.tags.every((tag) => typeof tag.eventType === "string"));
  assert.match(page.text("#saveHint"), /Saved/);
  assert.match(page.text("#videoHeaderMeta"), /IN PROGRESS/);
  page.close();
});

test("moments without a type never block publishing; viewers just don't see them", async () => {
  const page = await startApp({ tables: standardTables() });
  await page.openFromLibrary("Test FC vs Rivals");
  await page.press("Enter");
  assert.match(page.text("#actionHint"), /1 moment without an event type is saved but hidden from viewers/);
  assert.equal(page.$("#publishVideoButton").disabled, false);
  await page.click("#publishVideoButton");
  await settle(6);
  const row = videoInDb(page, IN_PROGRESS_ID);
  assert.equal(row.status, "published");
  assert.ok(row.published_at);
  assert.equal(page.$("#saveVideoButton").hidden, true, "published videos only offer Re-publish");
  assert.equal(page.text("#publishVideoButton"), "Re-publish changes");
  assert.equal(page.$("#publishVideoButton").disabled, true, "nothing to re-publish yet");
  page.close();
});

test("Re-publish sends changes live; a published video is never autosaved", async () => {
  const page = await startApp({ tables: standardTables() });
  await page.openFromLibrary("Test FC vs Okanagan");
  page.vimeo.current.time = 2000;
  const callsBefore = page.supabase.calls.filter((call) => call[0] === "videos" && call[1] === "upsert").length;
  await page.press("t");
  assert.equal(page.state.autosaveTimer, null, "nothing scheduled for a published video");
  await page.app.autosave();
  assert.equal(page.supabase.calls.filter((call) => call[0] === "videos" && call[1] === "upsert").length, callsBefore, "no autosave");
  assert.match(page.text("#actionHint"), /re-publish/);
  await page.click("#publishVideoButton");
  await settle(6);
  assert.ok(videoInDb(page, PUBLISHED_ID).tags.some((tag) => tag.eventType === "shot_on_target" && tag.timestampSeconds === 1997));
  page.close();
});

test("Unpublish from the editor saves open edits and moves the video back to In progress", async () => {
  const page = await startApp({ tables: standardTables() });
  await page.openFromLibrary("Test FC vs Okanagan");
  page.vimeo.current.time = 2000;
  await page.press("w");
  await page.click("#unpublishVideoButton");
  await settle(6);
  assert.match(page.dialogs.confirms.at(-1), /Unpublish "Test FC vs Okanagan"\?.*unsaved changes will be saved/s);
  const row = videoInDb(page, PUBLISHED_ID);
  assert.equal(row.status, "in_progress");
  assert.equal(row.published_at, null);
  assert.ok(row.tags.some((tag) => tag.eventType === "kick_off"));
  assert.equal(page.$("#saveVideoButton").hidden, false);
  page.close();
});

test("Unpublish from the library works without opening the video", async () => {
  const page = await startApp({ tables: standardTables() });
  const unpublish = page.$$(".saved-video-item").find((item) => item.textContent.includes("Test FC vs Okanagan")).querySelector(".saved-video-actions .remove-video");
  assert.equal(unpublish.textContent, "Unpublish");
  await page.click(unpublish);
  await settle(6);
  assert.equal(videoInDb(page, PUBLISHED_ID).status, "in_progress");
  assert.ok(page.texts("#inProgressList strong").includes("Test FC vs Okanagan"));
  page.close();
});

test("saving refuses a Vimeo link that was changed without reopening it", async () => {
  const page = await startApp({ tables: standardTables() });
  await page.openFromLibrary("Test FC vs Rivals");
  await page.click("#editDetailsButton");
  await page.type("#videoUrl", "https://vimeo.com/999999999");
  await page.click("#saveVideoButton");
  assert.match(page.text("#notice"), /The Vimeo link changed/);
  await page.app.autosave();
  assert.match(page.text("#saveHint"), /Not saved yet: The Vimeo link changed/, "autosave refuses it too");
  page.close();
});

test("autosave: a change schedules a quiet save of an In progress video", async () => {
  const page = await startApp({ tables: standardTables() });
  await page.openFromLibrary("Test FC vs Rivals");
  page.vimeo.current.time = 700;
  await page.press("y");
  assert.equal(page.state.isDirty, true);
  assert.notEqual(page.state.autosaveTimer, null, "a save is scheduled after the change");
  const redraws = page.$("#tagList").firstElementChild;
  await page.app.autosave();
  await settle();
  assert.equal(page.state.isDirty, false);
  assert.equal(page.$("#tagList").firstElementChild, redraws, "autosave doesn't redraw the moments list");
  assert.match(page.text("#saveHint"), /Saved automatically at/);
  assert.ok(videoInDb(page, IN_PROGRESS_ID).tags.some((tag) => tag.eventType === "goal" && tag.timestampSeconds === 697));
  page.close();
});

test("autosave: a failed save says so once, then retries and succeeds", async () => {
  const page = await startApp({ tables: standardTables() });
  await page.openFromLibrary("Test FC vs Rivals");
  page.supabase.fail("videos", "upsert", "Failed to fetch");
  await page.press("q");
  await page.app.autosave();
  await settle();
  assert.match(page.text("#saveHint"), /Autosave failed: retrying/);
  assert.match(page.text("#notice"), /Couldn't save automatically/);
  assert.notEqual(page.state.autosaveTimer, null, "a retry is scheduled");
  await page.app.autosave();
  await settle();
  assert.equal(page.state.isDirty, false);
  assert.ok(videoInDb(page, IN_PROGRESS_ID).tags.some((tag) => tag.eventType === "throw_in"));
  page.close();
});

test("opening another video saves pending changes first instead of asking to discard them", async () => {
  const page = await startApp({ tables: standardTables() });
  await page.openFromLibrary("Test FC vs Rivals");
  page.vimeo.current.time = 1500;
  await page.press("r");
  await page.openFromLibrary("Test FC vs Queue");
  assert.equal(page.dialogs.confirms.filter((message) => /Discard/.test(message)).length, 0);
  assert.ok(videoInDb(page, IN_PROGRESS_ID).tags.some((tag) => tag.eventType === "shot_off_target"));
  assert.equal(page.state.activeRecord.title, "Test FC vs Queue");
  page.close();
});
