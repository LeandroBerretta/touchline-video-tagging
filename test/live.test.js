// UC: Live mode. Tag a match on the sideline against the match clock, keep it safe without signal,
// then attach the uploaded video and line the moments up with it.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { startApp, plain, videoRow, moment } from "./helpers/app.js";
import { standardTables, TEAM, PLAYERS } from "./fixtures.js";

const KICKOFF = new Date(2026, 9, 18, 14, 0, 0).getTime();
const at = (minutes, seconds = 0) => KICKOFF + (minutes * 60 + seconds) * 1000;
const LIVE_ID = "eeeeeeee-0000-4000-8000-000000000001";

// Every page is closed at the end even if its test fails, so the match clock's timer never keeps tests running.
const pages = [];
after(() => pages.forEach((page) => page.close()));
async function openPage(options) {
  const page = await startApp(options);
  pages.push(page);
  return page;
}

// Starts the app with the phone clock fixed at kick-off; page.setClock moves it.
async function livePage(options = {}) {
  const page = await openPage({ tables: standardTables(), ...options });
  let now = KICKOFF;
  page.app.liveClock.now = () => now;
  page.setClock = (time) => { now = time; };
  return page;
}

async function startMatch(page, name = "Test FC vs Live Rivals") {
  await page.click("#liveMatchButton");
  await page.type("#liveName", name);
  page.$("#liveSetup").dispatchEvent(new page.window.Event("submit", { bubbles: true, cancelable: true }));
  await page.settle();
}

const typeButton = (page, label) => page.$$("#liveTypes .live-type").find((button) => button.firstChild.textContent === label);
const playerButton = (page, number) => page.$$("#livePlayers .live-player").find((button) => button.textContent === String(number));
const userTags = (page) => page.state.live.tags.filter((tag) => !tag.liveAnchor && !["start_of_game", "half_time", "end_of_game"].includes(tag.eventType));
const storedLive = (page) => JSON.parse(page.window.localStorage.getItem("touchline.liveMatch") || "null");

test("Live match opens a phone screen; Start match starts the clock and saves kick-off", async () => {
  const page = await livePage();
  await page.click("#liveMatchButton");
  assert.equal(page.$("#livePanel").hidden, false);
  assert.ok(page.doc.body.classList.contains("live-open"), "the top bar folds away on the live screen");
  assert.equal(page.$("#liveSetup").hidden, false);
  assert.equal(page.$("#liveTeam").value, TEAM.id, "the only team is picked");

  await startMatch(page);
  assert.equal(page.$("#liveSetup").hidden, true);
  assert.equal(page.$("#liveRun").hidden, false);
  page.setClock(at(23, 41));
  page.app.renderLiveClock();
  assert.equal(page.text("#liveClock"), "23:41");
  assert.match(page.text("#livePhase"), /1st half · 0 moments/);
  const kickoff = page.state.live.tags[0];
  assert.equal(kickoff.eventType, "start_of_game");
  assert.equal(kickoff.liveAnchor, "kickoff");
  assert.equal(kickoff.liveAt, KICKOFF);
  assert.ok(storedLive(page), "kept on the device straight away");
  assert.ok(page.state.liveSyncTimer, "a send to the library is scheduled");

  await page.app.syncLive();
  const row = page.db.videos.find((video) => video.id === page.state.live.id);
  assert.equal(row.vimeo_url, "");
  assert.equal(row.status, "in_progress");
  assert.equal(row.team_id, TEAM.id);
  assert.equal(row.tags[0].liveAnchor, "kickoff");
  assert.equal(row.tags[0].liveAt, KICKOFF);
  assert.match(page.text("#liveSync"), /Everything is saved/);
  assert.equal(page.$("#waitingSection").hidden, false);
  assert.match(page.text("#waitingList"), /Test FC vs Live Rivals.*Live now/);
  page.close();
});

test("a name is required, and the team when there are teams", async () => {
  const page = await livePage();
  await page.click("#liveMatchButton");
  await page.choose("#liveTeam", "");
  page.$("#liveSetup").dispatchEvent(new page.window.Event("submit", { bubbles: true, cancelable: true }));
  await page.settle();
  assert.match(page.text("#liveNotice"), /name/);
  await page.type("#liveName", "Match");
  page.$("#liveSetup").dispatchEvent(new page.window.Event("submit", { bubbles: true, cancelable: true }));
  await page.settle();
  assert.match(page.text("#liveNotice"), /team/);
  assert.equal(page.state.live, null);
  page.close();
});

test("tap a type, then shirt numbers for the last event; tapping the next type moves on", async () => {
  const page = await livePage();
  await startMatch(page);
  page.setClock(at(12, 5));
  await page.click(typeButton(page, "Corner"));
  let [corner] = userTags(page);
  assert.equal(corner.eventType, "corner");
  assert.equal(corner.done, true);
  assert.equal(corner.timestampSeconds, 725, "time since kick-off until it is lined up");
  assert.equal(corner.liveHalf, 1);
  assert.match(page.text("#liveLast"), /LAST · 12:05 Corner/);

  await page.click(playerButton(page, 9));
  await page.click(playerButton(page, 4));
  corner = userTags(page)[0];
  assert.deepEqual(plain(corner.playerIds), [PLAYERS[0].id, PLAYERS[2].id]);
  assert.equal(playerButton(page, 9).getAttribute("aria-pressed"), "true");
  await page.click(playerButton(page, 4));
  assert.deepEqual(plain(userTags(page)[0].playerIds), [PLAYERS[0].id], "a second tap takes the player off");
  assert.match(page.text("#liveLast"), /Corner · #9 Nine Example/);

  page.setClock(at(13, 0));
  await page.click(typeButton(page, "Goal"));
  assert.equal(userTags(page).length, 2);
  assert.deepEqual(plain(userTags(page)[1].playerIds), [], "the new event starts with no player");
  assert.deepEqual(plain(userTags(page)[0].playerIds), [PLAYERS[0].id], "the corner keeps its player");

  await page.click("#liveUndoButton");
  assert.equal(userTags(page).length, 1);
  assert.equal(page.$("#liveLast").hidden, true);
  assert.ok(playerButton(page, 9).disabled, "numbers need an event to go on");
  page.close();
});

test("More types saves the time first; search picks a type, your own name works, Later leaves it untyped", async () => {
  const page = await livePage();
  await startMatch(page);
  page.setClock(at(31, 5));
  await page.click(typeButton(page, "More types…"));
  assert.ok(page.$("#liveTypeDialog").open);
  assert.match(page.text("#liveTypeTime"), /31:05/);
  page.setClock(at(31, 40));
  await page.type("#liveTypeSearch", "pen");
  assert.deepEqual(page.texts("#liveTypeList button"), ["Penalty", 'Use "pen"']);
  await page.click(page.$("#liveTypeList button"));
  const [penalty] = userTags(page);
  assert.equal(penalty.eventType, "penalty");
  assert.equal(penalty.timestampSeconds, 31 * 60 + 5, "the time from when More types was tapped");
  assert.equal(page.$("#liveTypeDialog").open, false);

  await page.click(typeButton(page, "More types…"));
  await page.type("#liveTypeSearch", "Great save by keeper");
  await page.click(page.$$("#liveTypeList button").at(-1));
  assert.equal(userTags(page)[1].eventType, "other");
  assert.equal(userTags(page)[1].customEventType, "Great save by keeper");

  await page.click(typeButton(page, "More types…"));
  await page.click("#liveTypeLater");
  assert.equal(userTags(page)[2].eventType, "");
  assert.match(page.text("#liveLast"), /Moment \(type later\)/);

  await page.click("#liveChangeButton");
  await page.click(page.$$("#liveTypeList button").find((button) => button.textContent === "Offside"));
  assert.equal(userTags(page)[2].eventType, "offside", "Change sets the type of the last event");
  page.close();
});

test("no signal: tags stay on the phone and are sent when the connection is back", async () => {
  const page = await livePage();
  await startMatch(page);
  page.supabase.fail("videos", "upsert", "Failed to fetch");
  await page.app.syncLive();
  page.setClock(at(5));
  await page.click(typeButton(page, "Throw-in"));
  page.setClock(at(6));
  await page.click(typeButton(page, "Corner"));
  assert.match(page.text("#liveSync"), /No signal: 3 changes saved on this phone/);
  assert.equal(page.db.videos.some((video) => video.id === page.state.live.id), false);
  assert.equal(storedLive(page).tags.length, 3);

  await page.app.syncLive();
  const row = page.db.videos.find((video) => video.id === page.state.live.id);
  assert.deepEqual(row.tags.map((tag) => tag.eventType), ["start_of_game", "throw_in", "corner"]);
  assert.match(page.text("#liveSync"), /Everything is saved/);

  // Later sends update the moments only, so they never wipe a video link attached elsewhere.
  row.vimeo_url = "https://vimeo.com/999";
  await page.click(typeButton(page, "Goal"));
  await page.app.syncLive();
  assert.equal(row.vimeo_url, "https://vimeo.com/999");
  assert.equal(row.tags.length, 4);
  page.close();
});

test("half-time stops the clock; the second half carries on from it; End match saves and clears the phone", async () => {
  const page = await livePage();
  await startMatch(page);
  page.setClock(at(30));
  await page.click("#liveHalfButton");
  assert.equal(page.text("#liveHalfButton"), "▶ Start 2nd half");
  page.setClock(at(38));
  page.app.renderLiveClock();
  assert.equal(page.text("#liveClock"), "30:00", "the clock holds at half-time");
  assert.match(page.text("#livePhase"), /Half-time/);

  await page.click("#liveHalfButton");
  assert.equal(page.$("#liveHalfButton").hidden, true);
  page.setClock(at(40));
  page.app.renderLiveClock();
  assert.equal(page.text("#liveClock"), "32:00");
  await page.click(typeButton(page, "Shot on target"));
  const shot = userTags(page)[0];
  assert.equal(shot.liveHalf, 2);
  assert.match(page.text("#liveLast"), /32:00/);
  const restart = page.state.live.tags.find((tag) => tag.liveAnchor === "second_half");
  assert.equal(restart.eventType, "kick_off");
  assert.equal(restart.liveAt, at(38));

  page.setClock(at(70));
  await page.click("#liveEndButton");
  assert.equal(page.$("#liveDone").hidden, false);
  assert.ok(page.state.live.tags.some((tag) => tag.eventType === "end_of_game"));
  await page.app.syncLive();
  assert.equal(storedLive(page), null, "the phone's copy goes once the library has everything");
  assert.match(page.text("#liveDoneText"), /Waiting for video/);
  const row = page.db.videos.find((video) => video.id === page.state.live.id);
  assert.deepEqual(row.tags.map((tag) => tag.eventType), ["start_of_game", "half_time", "kick_off", "shot_on_target", "end_of_game"]);

  await page.click("#liveDoneButton");
  assert.equal(page.state.live, null);
  assert.equal(page.$("#tagPanel").hidden, false);
  assert.match(page.text("#waitingList"), /Test FC vs Live Rivals.*Tagged live · 1 moment · No video yet/);
  page.close();
});

test("a reload mid-match goes straight back to the running match", async () => {
  const saved = {
    id: LIVE_ID, title: "Reloaded match", teamId: TEAM.id, kickoffAt: KICKOFF, halfTimeAt: null, secondHalfAt: null, endedAt: null,
    tags: [moment("k", 0, "start_of_game", { liveAt: KICKOFF, liveHalf: 1, liveAnchor: "kickoff" }), moment("c", 60, "corner", { liveAt: at(1), liveHalf: 1 })],
    lastId: "c", unsent: ["k", "c"], inserted: false, failed: true,
  };
  const page = await openPage({ tables: standardTables(), storage: { "touchline.liveMatch": JSON.stringify(saved) } });
  assert.equal(page.$("#livePanel").hidden, false);
  assert.equal(page.$("#liveRun").hidden, false);
  assert.equal(page.text("#liveTitle"), "Reloaded match");
  assert.match(page.text("#liveLast"), /Corner/);
  await page.app.syncLive();
  assert.ok(page.db.videos.some((video) => video.id === LIVE_ID));
  await page.click("#liveCloseButton");
  assert.equal(page.$("#liveResume").hidden, false);
  assert.match(page.text("#liveResumeText"), /Live match running: "Reloaded match"/);
  page.close();
});

function liveRow() {
  return videoRow({
    id: LIVE_ID,
    name: "Test FC vs Live Rivals",
    teamId: TEAM.id,
    url: "",
    tags: [
      moment("k", 0, "start_of_game", { liveAt: KICKOFF, liveHalf: 1, liveAnchor: "kickoff" }),
      moment("c", 600, "corner", { liveAt: at(10), liveHalf: 1, playerIds: [PLAYERS[0].id] }),
      moment("h", 1800, "half_time", { liveAt: at(30), liveHalf: 1 }),
      moment("r", 2400, "kick_off", { liveAt: at(40), liveHalf: 2, liveAnchor: "second_half" }),
      moment("g", 3000, "goal", { liveAt: at(50), liveHalf: 2 }),
    ],
  });
}

test("Waiting for video: open it to edit the moments without a video, then attach the video and keep the edits", async () => {
  const tables = standardTables();
  tables.videos.push(liveRow());
  const page = await livePage({ tables });
  assert.equal(page.$("#waitingSection").hidden, false);
  assert.match(page.text("#waitingList"), /Tagged live · 2 moments · No video yet/);
  assert.doesNotMatch(page.text("#queueList"), /Live Rivals/);
  await page.click(page.$$("#waitingList .saved-video").at(0));
  await page.settle(6);

  // The moments open for editing, at match time, with an Attach video box where the player would be.
  assert.equal(page.state.activeRecord.id, LIVE_ID);
  assert.equal(page.state.noVideo, true);
  assert.equal(page.$("#noVideoBox").hidden, false);
  assert.equal(page.$("#tagsCard").hidden, false);
  assert.equal(page.$("#liveAlign").hidden, true);
  assert.match(page.text("#videoHeaderMeta"), /IN PROGRESS · NO VIDEO YET/);
  assert.equal(page.$("#queueVideoButton").hidden, true);
  assert.equal(page.state.tags.find((tag) => tag.id === "g").timestampSeconds, 2400, "second half at match time");
  assert.ok(page.$("#markMomentButton").disabled, "nothing to mark against without a video");
  assert.ok(page.$("#tagsCard").classList.contains("no-video"), "marking controls are hidden");
  const order = page.texts("#tagList .match-divider, #tagList .tag-summary-main");
  assert.ok(order.indexOf("2nd half") < order.findIndex((text) => text.startsWith("Kick-off")), "the second-half kick-off opens the 2nd half");

  // Edit: give the goal a scorer and change the corner's type, then save.
  page.app.updateTag("g", { playerIds: [PLAYERS[1].id] });
  page.app.updateTag("c", { eventType: "free_kick" });
  page.app.renderTags();
  assert.match(page.text("#tagList"), /Free kick/);
  assert.ok(page.state.autosaveTimer, "edits save automatically");
  await page.click("#saveVideoButton");
  let row = page.db.videos.find((video) => video.id === LIVE_ID);
  assert.equal(row.vimeo_url, "");
  assert.equal(row.tags.find((tag) => tag.id === "c").eventType, "free_kick");
  assert.deepEqual(row.tags.find((tag) => tag.id === "g").playerIds, [PLAYERS[1].id]);
  assert.equal(row.tags.find((tag) => tag.id === "g").liveAt, at(50));

  // Attach the video: an unsaved edit comes along, and the line-up card opens.
  page.app.updateTag("g", { note: "Great finish" });
  await page.type("#attachUrl", "https://vimeo.com/444444444");
  await page.click("#attachButton");
  await page.settle(12);
  assert.equal(page.state.noVideo, false);
  assert.equal(page.$("#noVideoBox").hidden, true);
  assert.equal(page.state.tags.find((tag) => tag.id === "g").note, "Great finish");
  assert.equal(page.state.isDirty, true, "the new link is an unsaved change");
  assert.equal(page.$("#liveAlign").hidden, false);
  assert.equal(page.$("#liveAlign").open, true, "not lined up yet, so the card starts open");
  await page.app.autosave();
  row = page.db.videos.find((video) => video.id === LIVE_ID);
  assert.equal(row.vimeo_url, "https://vimeo.com/444444444");
  assert.equal(row.tags.find((tag) => tag.id === "g").note, "Great finish");
  assert.equal(page.$("#waitingSection").hidden, true);
  assert.match(page.text("#inProgressList"), /Test FC vs Live Rivals/);
  page.close();
});

test("an invalid link in Attach video is refused and the moments stay open", async () => {
  const tables = standardTables();
  tables.videos.push(liveRow());
  const page = await livePage({ tables });
  await page.click(page.$$("#waitingList .saved-video").at(0));
  await page.type("#attachUrl", "https://youtube.com/watch?v=1");
  await page.click("#attachButton");
  assert.match(page.text("#notice"), /Vimeo/);
  assert.equal(page.state.noVideo, true);
  assert.equal(page.state.activeRecord.id, LIVE_ID);
  page.close();
});

test("line up: find kick-off moves every moment, with a nudge; the live times survive saving", async () => {
  const tables = standardTables();
  tables.videos.push({ ...liveRow(), vimeo_url: "https://vimeo.com/444444444" });
  const page = await livePage({ tables });
  await page.openFromLibrary("Test FC vs Live Rivals");
  page.vimeo.current.time = 252;
  await page.click("#alignKickoffUse");
  assert.equal(page.$("#alignKickoff").value, "04:12");
  assert.match(page.text("#alignPreview"), /Kick-off lands at 04:12, the last moment at 54:12/);
  await page.click("#alignNudgeDown");
  await page.click("#alignNudgeDown");
  assert.equal(page.text("#alignNudge"), "-2 s");
  assert.equal(page.text("#alignApplyButton"), "Apply to 3 moments");
  await page.click("#alignApplyButton");
  const time = (id) => page.state.tags.find((tag) => tag.id === id).timestampSeconds;
  assert.equal(time("k"), 250);
  assert.equal(time("c"), 850);
  assert.equal(time("g"), 3250);
  assert.equal(page.state.isDirty, true);

  await page.app.autosave();
  const saved = page.db.videos.find((video) => video.id === LIVE_ID).tags;
  assert.equal(saved.find((tag) => tag.id === "c").liveAt, at(10));
  assert.equal(saved.find((tag) => tag.id === "r").liveAnchor, "second_half");
  assert.equal(saved.find((tag) => tag.id === "g").liveHalf, 2);
  page.close();
});

test("line up: each half from its own kick-off, and from the clock shown on screen", async () => {
  const page = await livePage({ as: null });
  const tags = liveRow().tags;
  const halves = page.app.liveAlignment(tags, { method: "halves", kickoff: 100, second: 2700, nudge: 0 });
  assert.equal(halves.get("c"), 700);
  assert.equal(halves.get("h"), 1900);
  assert.equal(halves.get("r"), 2700, "a long half-time break in the video is handled");
  assert.equal(halves.get("g"), 3300);
  assert.throws(() => page.app.liveAlignment(tags, { method: "halves", kickoff: 100, second: 50 }), /after kick-off/);
  assert.throws(() => page.app.liveAlignment(tags.filter((tag) => tag.id !== "r"), { method: "halves", kickoff: 100, second: 2700 }), /no second-half kick-off/);

  // The camera's clock shows 14:15:09 at video 15:09 here: the video started at 14:00:00.
  const clock = page.app.liveAlignment(tags, { method: "clock", clockVideo: 909, clockShown: page.app.parseClockTime("14:15:09"), nudge: 1 });
  assert.equal(clock.get("k"), 1);
  assert.equal(clock.get("c"), 601);
  assert.equal(clock.get("g"), 3001);
  assert.throws(() => page.app.liveAlignment(tags, { method: "kickoff", kickoff: null }), /kick-off/);
  page.close();
});

test("parseClockTime reads 24-hour and am/pm times", async () => {
  const page = await openPage({ as: null });
  const { parseClockTime } = page.app;
  assert.equal(parseClockTime("14:15:09"), 14 * 3600 + 15 * 60 + 9);
  assert.equal(parseClockTime("2:15:09 pm"), 14 * 3600 + 15 * 60 + 9);
  assert.equal(parseClockTime("12:05 AM"), 300);
  assert.equal(parseClockTime("9:30"), 9 * 3600 + 1800);
  assert.equal(parseClockTime("25:00"), null);
  assert.equal(parseClockTime("14:61"), null);
  assert.equal(parseClockTime("soon"), null);
  page.close();
});

test("viewers never get Live mode", async () => {
  const page = await openPage({ as: "viewer", tables: standardTables() });
  page.app.openLive();
  assert.equal(page.$("#livePanel").hidden, true);
  page.close();
});

test("pass chain: the first tap starts a Pass sequence, each tap counts, Lost it or any other event ends it", async () => {
  const page = await livePage();
  await startMatch(page);
  page.setClock(at(8, 20));
  await page.click("#livePassStart");
  assert.equal(page.$("#livePassActive").hidden, false);
  assert.equal(page.text("#livePassCount"), "1");
  page.setClock(at(8, 30));
  for (let i = 0; i < 4; i++) await page.click("#livePassPlus");
  await page.click("#livePassMinus");
  assert.equal(page.text("#livePassCount"), "4");
  let [chain] = userTags(page);
  assert.equal(chain.eventType, "pass_sequence");
  assert.equal(chain.passCount, 4);
  assert.equal(chain.timestampSeconds, 500, "timed at the first pass");
  assert.match(page.text("#liveLast"), /Pass sequence · 4 passes/);
  await page.click("#livePassStop");
  assert.equal(page.$("#livePassActive").hidden, true);
  assert.equal(page.$("#livePassStart").hidden, false);
  assert.match(page.text("#liveNotice"), /4 passes/);

  await page.click("#livePassStart");
  await page.click("#livePassPlus");
  await page.click(typeButton(page, "Shot on target"));
  assert.equal(page.state.live.chainId, null, "a shot ends the chain");
  assert.equal(userTags(page)[1].passCount, 2);
  await page.app.syncLive();
  const saved = page.db.videos.find((video) => video.id === page.state.live.id).tags;
  assert.deepEqual(saved.filter((tag) => tag.eventType === "pass_sequence").map((tag) => tag.passCount), [4, 2]);
  assert.equal(saved.find((tag) => tag.eventType === "shot_on_target").passCount, undefined);
});

test("Publish without video: viewers see the events at match time and the stats, with nothing to play yet", async () => {
  const tables = standardTables();
  tables.videos.push(liveRow());
  const page = await livePage({ tables });
  const publish = page.$$("#waitingList .remove-video").find((button) => button.textContent === "Publish without video");
  await page.click(publish);
  await page.settle(8);
  const row = page.db.videos.find((video) => video.id === LIVE_ID);
  assert.equal(row.status, "published");
  assert.equal(row.vimeo_url, "");
  const time = (id) => row.tags.find((tag) => tag.id === id).timestampSeconds;
  assert.equal(time("c"), 600);
  assert.equal(time("h"), 1800);
  assert.equal(time("r"), 1800, "the second half carries on from half-time, the break left out");
  assert.equal(time("g"), 2400);
  assert.equal(row.tags.find((tag) => tag.id === "g").liveAt, at(50), "the live times are kept for lining up later");
  assert.match(page.text("#publishedList"), /Test FC vs Live Rivals.*No video yet/);

  const viewer = await openPage({ as: "viewer", tables: { ...standardTables(), videos: [...standardTables().videos, row] } });
  assert.match(viewer.text("#watchVideoList"), /Test FC vs Live Rivals.*Video coming soon/);
  await viewer.openInWatch("Test FC vs Live Rivals");
  assert.match(viewer.text("#watchVideoFrame"), /Video coming soon/);
  assert.equal(viewer.vimeo.players?.length ?? 0, 0, "no Vimeo player is opened");
  assert.match(viewer.text("#watchGroups"), /Corner/);
  assert.ok(viewer.$$(".watch-group-play").every((button) => button.disabled));
  await viewer.click("#watchViewStatsButton");
  assert.match(viewer.text("#watchStatsView"), /Split at Half-time \(30:00\)/);

  // The admin attaches the video later from the Published list.
  await page.click(page.$$("#publishedList .saved-video").find((button) => /Live Rivals/.test(button.textContent)));
  await page.settle(6);
  assert.equal(page.state.noVideo, true);
  assert.match(page.text("#videoHeaderMeta"), /PUBLISHED · NO VIDEO YET/);
  assert.equal(page.$("#noVideoBox").hidden, false);
});

test("retired event types keep their names on old moments but are no longer offered", async () => {
  const page = await openPage({ tables: standardTables({ inProgressTags: [moment("old", 300, "tackle")] }) });
  assert.equal(page.app.tagEventLabel({ eventType: "tackle" }), "Tackle");
  for (const value of ["assist", "carry", "dribble", "tackle", "interception", "block"]) {
    assert.ok(!page.app.eventTypes.some(([type]) => type === value), `${value} is still offered`);
  }
  for (const value of ["break_away", "break_away_pass", "through_ball", "chance_created", "switch_of_play", "counter_attack", "ball_won", "ball_lost", "great_play", "coaching_point", "pass_sequence"]) {
    assert.ok(page.app.eventTypes.some(([type]) => type === value), `${value} is missing`);
  }
  await page.openFromLibrary("Test FC vs Rivals");
  assert.match(page.text("#tagList"), /Tackle/);
  const select = page.$('[data-tag-id="old"] .event-type');
  assert.equal(select.value, "tackle");
  assert.match(select.selectedOptions[0].textContent, /no longer offered/);
});

test("Stats show a Passing section for pass sequences, and the tag row edits the count", async () => {
  const tags = [
    moment("s", 10, "start_of_game"),
    moment("p1", 100, "pass_sequence", { passCount: 3 }),
    moment("p2", 200, "pass_sequence", { passCount: 7 }),
    moment("p3", 300, "pass_sequence", { passCount: 1 }),
  ];
  const page = await openPage({ tables: standardTables({ publishedTags: tags, inProgressTags: tags }) });
  await page.tab("watch");
  await page.openInWatch("Test FC vs Okanagan");
  await page.click("#watchViewStatsButton");
  const stats = page.text("#watchStatsView");
  assert.match(stats, /Passing/);
  assert.match(stats, /11 passes in 3 sequences\. Longest: 7 passes\. Average: 3\.7/);
  assert.match(stats, /3 or more passes\s*2/);
  assert.match(stats, /5 or more passes\s*1/);

  await page.tab("tag");
  await page.openFromLibrary("Test FC vs Rivals");
  assert.match(page.text('[data-tag-id="p2"] .tag-summary-main'), /Pass sequence · 7 passes/);
  const input = page.$('[data-tag-id="p2"] .pass-count-field input');
  await page.type('[data-tag-id="p2"] .pass-count-field input', "8");
  assert.equal(page.state.tags.find((tag) => tag.id === "p2").passCount, 8);
  assert.ok(input);
});
