// UC7 watch: video list, groups, back-to-back clips, Choose clips, Tagged moments only, timeline, stats.
import { test } from "node:test";
import assert from "node:assert/strict";
import { startApp, settle } from "./helpers/app.js";
import { standardTables, OTHER_TEAM } from "./fixtures.js";
import { videoRow, moment } from "./helpers/app.js";

async function watchOkanagan(as = "viewer") {
  const page = await startApp({ as, tables: standardTables() });
  if (as === "admin") await page.tab("watch");
  await page.openInWatch("Test FC vs Okanagan");
  return page;
}

const groupNames = (page) => page.$$(".watch-group-select span:first-of-type").map((el) => el.textContent);
const groupPlay = (page, name) => page.$$(".watch-group").find((group) => group.querySelector(".watch-group-select span").textContent === name).querySelector(".watch-group-play");

test("viewers only see published videos, as cards with team, date and moment count", async () => {
  const page = await startApp({ as: "viewer", tables: standardTables() });
  assert.deepEqual(page.texts(".watch-video-card strong"), ["Test FC vs Okanagan"]);
  assert.match(page.text(".watch-video-card span"), /Test FC · .* · 4 moments/, "markers and untyped moments aren't counted");
  page.close();
});

test("cards are newest first and filter by team when there is more than one", async () => {
  const tables = standardTables();
  tables.teams.push(OTHER_TEAM);
  tables.videos.push(videoRow({ id: "eeeeeeee-0000-4000-8000-000000000001", name: "Second FC final", status: "published", teamId: OTHER_TEAM.id, updated: "2026-10-12T10:00:00Z", tags: [moment("s1", 50, "goal")] }));
  const page = await startApp({ as: "viewer", tables });
  assert.deepEqual(page.texts(".watch-video-card strong"), ["Second FC final", "Test FC vs Okanagan"]);
  assert.equal(page.$("#watchTeamFilterLabel").hidden, false);
  await page.choose("#watchTeamFilter", OTHER_TEAM.id);
  assert.deepEqual(page.texts(".watch-video-card strong"), ["Second FC final"]);
  page.close();
});

test("events are grouped by type in event-list order, folded, and untyped moments are left out", async () => {
  const page = await watchOkanagan();
  assert.deepEqual(groupNames(page), ["Start of game", "Goal", "Shot on target", "Corner", "Half-time"]);
  assert.equal(page.text("#watchEventCount"), "6");
  assert.ok(page.$$(".watch-event-list").every((list) => list.hidden), "groups start folded");
  page.close();
});

test("a group's ▶ Play plays its clips back to back, 3 s before each, then stops", async () => {
  const page = await watchOkanagan();
  const player = page.vimeo.current;
  await page.click(groupPlay(page, "Goal"));
  assert.equal(player.time, 597, "first goal at 10:00, minus 3 s");
  assert.match(page.text("#playlistStatus"), /Goal: clip 1 of 2/);
  assert.ok(page.doc.body.classList.contains("playlist-playing"));
  await player.advance(21);
  await settle();
  assert.ok(player.time >= 3597 && player.time < 3620, `jumped to the second goal (at ${player.time})`);
  assert.match(page.text("#playlistStatus"), /clip 2 of 2/);
  await player.advance(21);
  await settle();
  assert.match(page.text("#watchNotice"), /Finished all 2 clips/);
  assert.equal(page.$("#playlistBar").hidden, true);
  page.close();
});

test("moving the video by hand stops the clips", async () => {
  const page = await watchOkanagan();
  await page.click(groupPlay(page, "Goal"));
  page.vimeo.current.time = 5000;
  page.vimeo.current.emit("seeked", { seconds: 5000 });
  await settle();
  assert.equal(page.state.playlist, null);
  assert.match(page.text("#watchNotice"), /Stopped the clips/);
  page.close();
});

test("Choose clips reveals tick boxes; Play selected plays ticked events in match order", async () => {
  const page = await watchOkanagan("admin");
  assert.equal(page.$("#watchEventsCard").classList.contains("choosing"), false);
  await page.click("#chooseClipsButton");
  assert.equal(page.$("#watchEventsCard").classList.contains("choosing"), true);
  const box = (id) => page.$(`.watch-event-pick[data-tag-id="${id}"]`);
  for (const id of ["p-corner", "p-goal1"]) {
    box(id).checked = true;
    box(id).dispatchEvent(new page.window.Event("change", { bubbles: true }));
  }
  await settle();
  assert.match(page.text("#playSelectedButton"), /2 clips/);
  await page.click("#playSelectedButton");
  assert.equal(page.state.playlist.clips.map((clip) => clip.tag.id).join(), "p-goal1,p-corner");
  page.close();
});

test("Tagged moments only plays every event except markers, with a running time", async () => {
  const page = await watchOkanagan();
  assert.match(page.text("#watchMomentsButton"), /about 1 min/, "4 clips × 20 s");
  await page.click("#watchMomentsButton");
  assert.deepEqual(page.state.playlist.clips.map((clip) => clip.tag.id), ["p-goal1", "p-shot", "p-corner", "p-goal2"]);
  page.close();
});

test("clicking an event plays it from 3 seconds before", async () => {
  const page = await watchOkanagan();
  await page.click(page.$(".watch-group-toggle"));
  await page.click(page.$(".watch-event"));
  assert.equal(page.vimeo.current.time, 7, "Start of game at 0:10");
  page.close();
});

test("the clip length applies to new clips and is remembered", async () => {
  const page = await watchOkanagan();
  await page.choose("#clipLength", "5");
  assert.equal(page.window.localStorage.getItem("touchline.clipLengthSeconds"), "5");
  await page.click(groupPlay(page, "Goal"));
  const clip = page.state.playlist.clips[0];
  assert.equal(clip.end - clip.start, 5);
  page.close();
});

test("the Watch timeline: a tick per event, markers skipped, goals marked, clicking plays", async () => {
  const page = await watchOkanagan();
  const ticks = page.$$("#watchTimelineBar .timeline-tick");
  assert.equal(ticks.length, 4);
  assert.equal(ticks.filter((tick) => tick.classList.contains("goal")).length, 2);
  assert.match(page.text("#watchTimelineHalf"), /Half-time 45:00/);
  await page.click(ticks[1]);
  assert.equal(page.vimeo.current.time, 897);
  await page.click(groupPlay(page, "Goal"));
  assert.ok(page.$(`#watchTimelineBar .timeline-tick[data-tag-id="p-goal1"]`).classList.contains("playing"));
  page.close();
});

test("stats split by half at Half-time, count players by identity, and play on click", async () => {
  const page = await watchOkanagan();
  await page.click("#watchViewStatsButton");
  const rowsText = page.$$("#watchStatsView tbody tr").map((row) => [...row.children].map((cell) => cell.textContent.trim()).join("|"));
  assert.ok(rowsText.includes("Goal|1|1|2"), rowsText.join(" / "));
  assert.ok(rowsText.includes("All events|2|2|4"));
  assert.ok(!rowsText.some((row) => row.startsWith("Start of game") || row.startsWith("Half-time")), "markers aren't counted");
  const players = page.texts(".stats-player-name");
  assert.deepEqual(players.slice(0, 2), ["#9 Nine Example", "#17 Seventeen Example"].sort((a, b) => (a.includes("17") ? -1 : 1)));
  assert.ok(players.includes("No player named"));
  const goalCount = page.$$("#watchStatsView .stat-play").find((button) => button.getAttribute("aria-label").startsWith("Goal: 2"));
  await page.click(goalCount);
  assert.equal(page.state.playlist.clips.length, 2);
  page.close();
});
