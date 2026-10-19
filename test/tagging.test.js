// UC2 tag a video and UC3 edit moments, including the faster-tagging keys and the Tag layout.
import { test } from "node:test";
import assert from "node:assert/strict";
import { startApp, settle, plain } from "./helpers/app.js";
import { standardTables, PLAYERS, IN_PROGRESS_ID } from "./fixtures.js";

const rows = (page) => page.texts("#tagList .tag-summary-main");

async function openRivals(page) {
  await page.openFromLibrary("Test FC vs Rivals");
  page.vimeo.current.time = 1000;
}

test("a new video starts with Start of game at 00:10 in Done, unsaved changes not flagged", async () => {
  const page = await startApp({ tables: standardTables() });
  await page.openNewVideo("Test FC vs Newcomers");
  assert.equal(page.state.tags.length, 1);
  assert.equal(page.state.tags[0].eventType, "start_of_game");
  assert.equal(page.state.tags[0].timestampSeconds, 10);
  assert.equal(page.state.isDirty, false);
  assert.match(page.text("#videoHeaderMeta"), /TEST FC · NEW, NOT SAVED YET/);
  assert.equal(page.text("#videoHeaderTitle"), "Test FC vs Newcomers");
  assert.ok(page.$("#tagPanel").classList.contains("has-video"), "the video form folds away");
  assert.equal(page.$("#timeline").hidden, false);
  page.close();
});

test("an invalid Vimeo link is refused with a clear message", async () => {
  const page = await startApp({ tables: standardTables() });
  await page.openNewVideo("Bad link", "https://youtube.com/watch?v=1");
  assert.match(page.text("#notice"), /Vimeo link/);
  assert.equal(page.state.activeRecord, null);
  page.close();
});

test("the Mark moment button marks an untyped moment (regression: the click was saved as its type)", async () => {
  const page = await startApp({ tables: standardTables() });
  await openRivals(page);
  await page.click("#markMomentButton");
  const marked = page.state.tags.find((tag) => tag.id === page.state.lastMarkedId);
  assert.equal(marked.eventType, "");
  assert.equal(marked.timestampSeconds, 997, "3 seconds earlier by default");
  assert.ok(rows(page).some((row) => row.startsWith("Needs a type")));
  assert.equal(page.$$(".tag-row .tag-status").filter((el) => /couldn't be shown/.test(el.textContent)).length, 0);
  assert.doesNotMatch(page.text("#notice"), /Could not/);
  page.close();
});

test("Enter marks a moment, honouring the mark-earlier setting", async () => {
  const page = await startApp({ tables: standardTables() });
  await openRivals(page);
  await page.choose("#markOffset", "10");
  await page.press("Enter");
  assert.equal(page.state.tags.find((tag) => tag.id === page.state.lastMarkedId).timestampSeconds, 990);
  page.close();
});

test("a quick-type key marks with that type straight into Done; Shift + shirt number adds the player", async () => {
  const page = await startApp({ tables: standardTables() });
  await openRivals(page);
  await page.press("e"); // Corner with the default quick types
  const corner = page.state.tags.find((tag) => tag.id === page.state.lastMarkedId);
  assert.equal(corner.eventType, "corner");
  assert.equal(corner.done, true);
  await page.shiftNumber("9");
  await page.shiftNumber("17");
  const updated = page.state.tags.find((tag) => tag.id === corner.id);
  assert.deepEqual(plain(updated.playerIds), [PLAYERS[0].id, PLAYERS[1].id]);
  assert.match(page.text("#lastMarkedText"), /Corner at 16:37 · #9 Nine Example, #17 Seventeen Example/);
  page.close();
});

test("number + Enter also adds a player; an unknown number explains itself", async () => {
  const page = await startApp({ tables: standardTables() });
  await openRivals(page);
  await page.press("y"); // Goal
  await page.press("4", { code: "Digit4" });
  await page.press("Enter");
  assert.deepEqual(plain(page.state.tags.find((tag) => tag.id === page.state.lastMarkedId).playerIds), [PLAYERS[2].id]);
  await page.shiftNumber("5");
  assert.match(page.text("#notice"), /No #5 in this video's squad/);
  page.close();
});

test("Backspace undoes the last mark, and the notice's Undo brings it back", async () => {
  const page = await startApp({ tables: standardTables() });
  await openRivals(page);
  const before = page.state.tags.length;
  await page.press("t");
  assert.equal(page.state.tags.length, before + 1);
  await page.press("Backspace");
  assert.equal(page.state.tags.length, before);
  await page.click(".notice-action");
  assert.equal(page.state.tags.length, before + 1);
  page.close();
});

test("quick buttons, the Done button and Enter in a field move moments from To do to Done", async () => {
  const page = await startApp({ tables: standardTables() });
  await openRivals(page);
  await page.press("Enter");
  const id = page.state.lastMarkedId;
  await page.click(`[data-tag-id="${id}"] .tag-summary-main`);
  const chip = page.$$(`[data-tag-id="${id}"] .quick-type`).find((button) => button.textContent === "Throw-in");
  await page.click(chip);
  assert.equal(page.state.tags.find((tag) => tag.id === id).eventType, "throw_in");
  await page.click(`[data-tag-id="${id}"] .done-button`);
  assert.equal(page.state.tags.find((tag) => tag.id === id).done, true);

  await page.press("Enter");
  const second = page.state.lastMarkedId;
  await page.click(`[data-tag-id="${second}"] .tag-summary-main`);
  await page.choose(`[data-tag-id="${second}"] .event-type`, "foul");
  const note = page.$(`[data-tag-id="${second}"] .moment-note`);
  note.dispatchEvent(new page.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  await settle();
  assert.equal(page.state.tags.find((tag) => tag.id === second).done, true);
  page.close();
});

test("Other needs a name before it can be done", async () => {
  const page = await startApp({ tables: standardTables() });
  await openRivals(page);
  await page.press("Enter");
  const id = page.state.lastMarkedId;
  await page.click(`[data-tag-id="${id}"] .tag-summary-main`);
  await page.choose(`[data-tag-id="${id}"] .event-type`, "other");
  assert.equal(page.$(`[data-tag-id="${id}"] .done-button`).disabled, true);
  await page.type(`[data-tag-id="${id}"] .custom-event`, "Press trigger");
  assert.equal(page.$(`[data-tag-id="${id}"] .done-button`).disabled, false);
  page.close();
});

test("a moment's time can be typed or taken from the video, and the list re-sorts", async () => {
  const page = await startApp({ tables: standardTables() });
  await openRivals(page);
  await page.click('[data-tag-id="m-corner"] .tag-summary-main');
  await page.click('[data-tag-id="m-corner"] .edit-time');
  page.$('[data-tag-id="m-corner"] .time-input').value = "0:05";
  page.$('[data-tag-id="m-corner"] .time-input').dispatchEvent(new page.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  await settle();
  assert.equal(page.state.tags.find((tag) => tag.id === "m-corner").timestampSeconds, 5);
  assert.equal(page.state.tags.sort(page.app.byTime)[0].id, "m-corner", "now before Start of game");
  page.close();
});

test("picking players: the squad picker, Other name, and typed names that match the squad", async () => {
  const page = await startApp({ tables: standardTables() });
  await openRivals(page);
  await page.press("Enter");
  const id = page.state.lastMarkedId;
  await page.click(`[data-tag-id="${id}"] .tag-summary-main`);
  const options = page.$$(`[data-tag-id="${id}"] .player-add option`).map((o) => o.textContent);
  assert.ok(options.includes("17 · Seventeen Example"));
  assert.ok(!options.some((o) => o.includes("Coach Example")), "staff are never offered");
  await page.choose(`[data-tag-id="${id}"] .player-add`, PLAYERS[1].id);
  await page.choose(`[data-tag-id="${id}"] .player-add`, "__other");
  await page.type(`[data-tag-id="${id}"] .player-names`, "Opponent Seven, four example");
  const tag = page.state.tags.find((item) => item.id === id);
  assert.deepEqual(plain(tag.playerIds), [PLAYERS[1].id, PLAYERS[2].id]);
  assert.equal(tag.otherPlayers, "Opponent Seven");
  page.close();
});

test("editing several To do moments at once: set type, then Done", async () => {
  const page = await startApp({ tables: standardTables() });
  await openRivals(page);
  await page.press("Enter");
  page.vimeo.current.time = 1200;
  await page.press("Enter");
  const todo = page.state.tags.filter((tag) => !tag.done).map((tag) => tag.id);
  assert.equal(todo.length, 2);
  const selectAll = page.$(".bulk-all input");
  selectAll.checked = true;
  selectAll.dispatchEvent(new page.window.Event("change", { bubbles: true }));
  await settle();
  const typeSelect = page.$$(".bulk-bar select")[0];
  await page.choose(typeSelect, "ball_won");
  assert.ok(todo.every((id) => page.state.tags.find((tag) => tag.id === id).eventType === "ball_won"));
  await page.click(".bulk-bar .done-button");
  assert.ok(todo.every((id) => page.state.tags.find((tag) => tag.id === id).done));
  page.close();
});

test("Delete all asks first and can be undone", async () => {
  const page = await startApp({ tables: standardTables() });
  await openRivals(page);
  await page.tab("tag");
  await page.click("#tagViewGroups");
  const doneCount = page.state.tags.filter((tag) => tag.done).length;
  const deleteDone = page.$$(".moment-group-done .delete-all")[0];
  await page.click(deleteDone);
  assert.match(page.dialogs.confirms.at(-1), /Delete all \d+ moments in Done/);
  assert.equal(page.state.tags.filter((tag) => tag.done).length, 0);
  await page.click(".notice-action");
  assert.equal(page.state.tags.filter((tag) => tag.done).length, doneCount);
  page.close();
});

test("Match order is the default, split at Half-time; the To do & Done view is remembered", async () => {
  const page = await startApp({ tables: standardTables() });
  await page.openFromLibrary("Test FC vs Rivals");
  page.vimeo.current.time = 2000;
  await page.press("Enter");
  await page.click(`[data-tag-id="${page.state.lastMarkedId}"] .tag-summary-main`);
  await page.choose(`[data-tag-id="${page.state.lastMarkedId}"] .event-type`, "half_time");
  page.app.renderTags();
  assert.equal(page.$("#tagViewMatch").getAttribute("aria-pressed"), "true");
  const dividers = page.texts("#tagList .match-divider");
  assert.deepEqual(dividers, ["1st half"], "nothing after half-time yet");
  await page.click("#tagViewGroups");
  assert.equal(page.window.localStorage.getItem("touchline.tagView"), "groups");
  assert.ok(page.texts("#tagList .moment-group-heading").some((heading) => heading.startsWith("To do")));
  page.close();
});

test("only one moment opens for editing at a time", async () => {
  const page = await startApp({ tables: standardTables() });
  await openRivals(page);
  await page.click('[data-tag-id="m-start"] .tag-summary-main');
  await page.click('[data-tag-id="m-corner"] .tag-summary-main');
  assert.equal(page.$$(".tag-editor").filter((editor) => !editor.hidden).length, 1);
  assert.equal(page.state.expandedTagId, "m-corner");
  page.close();
});

test("the timeline shows a tick per moment, skips markers, and seeks on click", async () => {
  const page = await startApp({ tables: standardTables() });
  await openRivals(page);
  await page.press("Enter");
  const ticks = page.$$("#timelineBar .timeline-tick");
  assert.equal(ticks.length, 2, "corner + the new untyped moment, no Start of game");
  assert.ok(ticks.some((tick) => tick.classList.contains("needs-type")));
  await page.click(ticks[0]);
  assert.equal(page.vimeo.current.time, 300);
  page.close();
});

test("Keys ? opens and closes the shortcut help", async () => {
  const page = await startApp({ tables: standardTables() });
  await openRivals(page);
  await page.click("#keysHelpButton");
  assert.equal(page.$("#keysHelp").hidden, false);
  await page.press("Escape");
  assert.equal(page.$("#keysHelp").hidden, true);
  page.close();
});

test("the Keys paused bar appears when the video takes the keyboard, not when switching apps", async () => {
  const page = await startApp({ tables: standardTables() });
  await openRivals(page);
  // jsdom can't move focus into a frame, so stand in for the browser: the focused element is the video.
  const frame = page.$("#videoFrame iframe");
  Object.defineProperty(page.doc, "activeElement", { get: () => frame, configurable: true });
  page.window.dispatchEvent(new page.window.Event("blur"));
  await settle();
  assert.equal(page.$("#keysPaused").hidden, false);
  page.window.dispatchEvent(new page.window.Event("focus"));
  assert.equal(page.$("#keysPaused").hidden, true);
  delete page.doc.activeElement; // back to the real focused element (the page body)
  page.window.dispatchEvent(new page.window.Event("blur"));
  await settle();
  assert.equal(page.$("#keysPaused").hidden, true);
  page.close();
});

test("tagging options: your own quick types keep the order you tick, and pause-on-mark pauses", async () => {
  const page = await startApp({ tables: standardTables() });
  await openRivals(page);
  const box = (label) => page.$$(".quick-type-choice").find((choice) => choice.textContent.trim() === label).querySelector("input");
  const tackle = box("Ball won");
  tackle.checked = true;
  tackle.dispatchEvent(new page.window.Event("change", { bubbles: true }));
  await settle();
  assert.equal(page.state.quickTypes.at(-1), "ball_won");
  assert.equal(page.state.quickTypes[0], "throw_in", "existing keys keep their place");
  assert.deepEqual(JSON.parse(page.window.localStorage.getItem("touchline.quickTypes")).at(-1), "ball_won");
  await page.press("u");
  assert.equal(page.state.tags.find((tag) => tag.id === page.state.lastMarkedId).eventType, "ball_won");

  page.$("#pauseOnMark").checked = true;
  page.vimeo.current.paused = false;
  await page.press("Enter");
  assert.equal(page.vimeo.current.paused, true);
  page.close();
});

test("zoom: + zooms in, the Reset button returns to the whole picture", async () => {
  const page = await startApp({ tables: standardTables() });
  await openRivals(page);
  await page.press("+", { code: "Equal", shift: true });
  assert.equal(page.text("#tagZoomLevel"), "150%");
  assert.match(page.$("#videoFrame iframe").style.transform, /scale\(1\.5\)/);
  await page.click("#tagZoomReset");
  assert.equal(page.text("#tagZoomLevel"), "100%");
  page.close();
});

test("pass chain while tagging a video: P starts and counts, L ends, another mark ends it, Backspace removes it", async () => {
  const page = await startApp({ tables: standardTables() });
  await openRivals(page);
  assert.equal(page.$("#passChainButton").disabled, false);
  await page.press("p");
  const chainId = page.state.passChainId;
  let chain = page.state.tags.find((tag) => tag.id === chainId);
  assert.equal(chain.eventType, "pass_sequence");
  assert.equal(chain.passCount, 1);
  assert.equal(chain.timestampSeconds, 997, "the mark offset applies to the first pass");
  assert.equal(chain.done, true);
  assert.equal(page.$("#passChainActive").hidden, false);
  page.vimeo.current.time = 1010;
  await page.press("p");
  await page.press("p");
  await page.click("#passChainPlus");
  await page.click("#passChainMinus");
  chain = page.state.tags.find((tag) => tag.id === chainId);
  assert.equal(chain.passCount, 3);
  assert.equal(chain.timestampSeconds, 997, "counting passes doesn't move the moment");
  assert.equal(page.text("#passChainCount"), "3");
  assert.match(page.text("#lastMarkedText"), /Pass sequence \(3 passes\)/);
  await page.press("l");
  assert.equal(page.state.passChainId, null);
  assert.equal(page.$("#passChainButton").hidden, false);
  assert.match(page.text("#notice"), /3 passes/);

  await page.press("p");
  await page.press("p");
  await page.press("t");
  assert.equal(page.state.passChainId, null, "marking a shot ends the chain");
  assert.equal(page.state.tags.filter((tag) => tag.eventType === "pass_sequence").map((tag) => tag.passCount).join(), "3,2");

  await page.press("p");
  await page.press("Backspace");
  assert.equal(page.state.passChainId, null);
  assert.equal(page.$("#passChainButton").hidden, false);
  assert.equal(page.state.tags.filter((tag) => tag.eventType === "pass_sequence").length, 2);
  page.vimeo.current.time = 1100;
  await page.click("#saveVideoButton");
  const saved = page.db.videos.find((video) => video.id === IN_PROGRESS_ID).tags.filter((tag) => tag.eventType === "pass_sequence");
  assert.deepEqual(saved.map((tag) => tag.passCount), [3, 2]);
  page.close();
});
