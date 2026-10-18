// UC5 reopen, UC6 remove, the Not started queue, library sections and search.
import { test } from "node:test";
import assert from "node:assert/strict";
import { startApp, settle } from "./helpers/app.js";
import { standardTables, TEAM, OTHER_TEAM, IN_PROGRESS_ID } from "./fixtures.js";

test("the library has Not started, In progress and Published sections with counts", async () => {
  const page = await startApp({ tables: standardTables() });
  assert.deepEqual(page.texts("#queueList strong"), ["Test FC vs Queue"]);
  assert.deepEqual(page.texts("#inProgressList strong"), ["Test FC vs Rivals"]);
  assert.deepEqual(page.texts("#publishedList strong"), ["Test FC vs Okanagan"]);
  assert.equal(page.text("#queueCount"), "1");
  assert.match(page.texts("#inProgressList .saved-video span")[0], /Test FC · 1 moment ·/, "markers aren't counted as moments");
  page.close();
});

test("Add to queue saves a video with Start of game and leaves it Not started", async () => {
  const page = await startApp({ tables: standardTables() });
  page.$("#videoName").value = "Test FC vs Later";
  page.$("#videoUrl").value = "https://vimeo.com/444444444";
  await page.click("#queueVideoButton");
  await settle(6);
  const row = page.db.videos.find((video) => video.name === "Test FC vs Later");
  assert.equal(row.status, "in_progress");
  assert.equal(row.team_id, TEAM.id);
  assert.deepEqual(row.tags.map((tag) => tag.eventType), ["start_of_game"]);
  assert.ok(page.texts("#queueList strong").includes("Test FC vs Later"));
  assert.equal(page.$("#videoName").value, "", "the form clears for the next one");
  page.close();
});

test("Add to queue warns about a Vimeo link already in the library", async () => {
  const page = await startApp({ tables: standardTables(), confirm: false });
  page.$("#videoName").value = "Duplicate";
  page.$("#videoUrl").value = "https://vimeo.com/123456789";
  await page.click("#queueVideoButton");
  assert.match(page.dialogs.confirms.at(-1), /already uses this Vimeo link/);
  assert.equal(page.db.videos.filter((video) => video.name === "Duplicate").length, 0);
  page.close();
});

test("reopening a video loads its moments and highlights it in the library", async () => {
  const page = await startApp({ tables: standardTables() });
  await page.openFromLibrary("Test FC vs Rivals");
  assert.equal(page.state.activeRecord.id, IN_PROGRESS_ID);
  assert.ok(page.$("#inProgressList .saved-video-item").classList.contains("active"));
  assert.equal(page.text("#videoHeaderTitle"), "Test FC vs Rivals");
  assert.ok(page.texts("#tagList .tag-summary-main").some((row) => row.startsWith("Corner")));
  page.close();
});

test("a video saved with a broken moment still opens (regression)", async () => {
  const tables = standardTables({ inProgressTags: [{ id: "bad", timestampSeconds: 2532, eventType: { isTrusted: true }, done: true }] });
  const page = await startApp({ tables });
  await page.openFromLibrary("Test FC vs Rivals");
  assert.ok(page.$("#videoFrame iframe"), "the video loaded");
  assert.deepEqual(page.texts("#tagList .tag-summary-main").map((row) => row.replace(/[▸✓▾]/g, "")), ["Needs a type"]);
  page.close();
});

test("Remove asks first, then deletes the video and resets the editor if it was open", async () => {
  const page = await startApp({ tables: standardTables() });
  await page.openFromLibrary("Test FC vs Rivals");
  const remove = page.$$(".saved-video-item").find((item) => item.textContent.includes("Test FC vs Rivals")).querySelector(".saved-video-actions .remove-video:last-child");
  await page.click(remove);
  await settle(6);
  assert.match(page.dialogs.confirms.at(-1), /cannot be undone/);
  assert.equal(page.db.videos.some((video) => video.id === IN_PROGRESS_ID), false);
  assert.equal(page.state.activeRecord, null);
  page.close();
});

test("search narrows all sections by name; Esc clears it; the team filter appears with two teams", async () => {
  const tables = standardTables();
  tables.teams.push(OTHER_TEAM);
  tables.videos[2].team_id = OTHER_TEAM.id;
  const page = await startApp({ tables });
  assert.equal(page.$("#libraryTeamFilter").hidden, false);
  await page.type("#librarySearch", "okan");
  assert.deepEqual([page.text("#queueCount"), page.text("#inProgressCount"), page.text("#publishedCount")], ["0", "0", "1"]);
  assert.match(page.text("#queueList"), /No matching videos/);
  page.$("#librarySearch").dispatchEvent(new page.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await settle();
  await page.choose("#libraryTeamFilter", OTHER_TEAM.id);
  assert.deepEqual(page.texts(".saved-video strong"), ["Test FC vs Queue"]);
  page.close();
});

test("Hide library is remembered on this device", async () => {
  const page = await startApp({ tables: standardTables() });
  await page.click("#toggleLibraryButton");
  assert.ok(page.$("#tagLayout").classList.contains("library-hidden"));
  assert.equal(page.window.localStorage.getItem("touchline.libraryHidden"), "true");
  page.close();
});
