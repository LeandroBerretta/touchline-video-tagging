// Tagging settings and pass sequences after the first match review: seconds before by type, the minimum
// pass sequence, cleaning up short sequences, throw-ins off the timelines, Won / Conceded fouls,
// the pass filter in Choose clips, and the time between sequences in Stats.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { startApp, moment } from "./helpers/app.js";
import { standardTables } from "./fixtures.js";

const pages = [];
after(() => pages.forEach((page) => page.close()));
async function openPage(options = {}) {
  const page = await startApp({ tables: standardTables(), ...options });
  pages.push(page);
  return page;
}

test("seconds before by type: defaults, editable, and other types keep the Mark setting", async () => {
  const page = await openPage();
  const leads = page.app.typeLeads();
  assert.deepEqual({ ...leads }, { throw_in: 3, shot_on_target: 10, shot_off_target: 10, foul_won: 5, foul_conceded: 5, goal: 15, cross: 7 });
  await page.openFromLibrary("Test FC vs Rivals");
  page.vimeo.current.time = 1000;
  await page.press("y");
  assert.equal(page.state.tags.find((tag) => tag.id === page.state.lastMarkedId).timestampSeconds, 985, "goal: 15 seconds before");
  await page.press("w");
  assert.equal(page.state.tags.find((tag) => tag.id === page.state.lastMarkedId).timestampSeconds, 997, "kick-off: the Mark setting (3 s)");

  const goalInput = page.$('#typeLeads input[data-type="goal"]');
  assert.equal(goalInput.value, "15");
  goalInput.value = "20";
  goalInput.dispatchEvent(new page.window.Event("change"));
  assert.equal(JSON.parse(page.window.localStorage.getItem("touchline.typeLeads")).goal, 20);
  await page.press("y");
  assert.equal(page.state.tags.find((tag) => tag.id === page.state.lastMarkedId).timestampSeconds, 980);
});

test("live: a type's seconds before apply, also when the type is picked later from More types", async () => {
  const page = await openPage();
  let now = new Date(2026, 9, 20, 10, 0, 0).getTime();
  page.app.liveClock.now = () => now;
  await page.click("#liveMatchButton");
  await page.type("#liveName", "Live match");
  page.$("#liveSetup").dispatchEvent(new page.window.Event("submit", { bubbles: true, cancelable: true }));
  await page.settle();
  now += 600000;
  page.$$("#liveTypes .live-type").find((button) => button.firstChild.textContent === "Throw-in").click();
  await page.settle();
  const throwIn = page.state.live.tags.find((tag) => tag.eventType === "throw_in");
  assert.equal(throwIn.timestampSeconds, 597, "throw-in: 3 seconds before");
  now += 60000;
  page.$$("#liveTypes .live-type").at(-1).click();
  await page.settle();
  await page.type("#liveTypeSearch", "goal");
  page.$$("#liveTypeList button").find((button) => button.textContent === "Goal").click();
  await page.settle();
  const goal = page.state.live.tags.find((tag) => tag.eventType === "goal");
  assert.equal(goal.timestampSeconds, 645, "goal picked from More types moves 15 seconds before the tap");
  now += 2000;
  page.$$("#liveTypes .live-type").find((button) => button.firstChild.textContent === "Kick-off").click();
  await page.settle();
  assert.equal(page.state.live.tags.find((tag) => tag.eventType === "kick_off" && !tag.liveAnchor).timestampSeconds, 662, "no seconds before for kick-off");
});

test("minimum pass sequence: setting shared by live and video; Off keeps every chain", async () => {
  const page = await openPage();
  assert.equal(page.$("#minPasses").value, "3");
  assert.equal(page.$("#liveMinPasses").value, "3");
  await page.choose("#liveMinPasses", "5");
  assert.equal(page.$("#minPasses").value, "5");
  assert.equal(page.window.localStorage.getItem("touchline.minPasses"), "5");

  await page.openFromLibrary("Test FC vs Rivals");
  page.vimeo.current.time = 1000;
  for (let i = 0; i < 4; i++) await page.press("p");
  await page.press("l");
  assert.match(page.text("#notice"), /4 passes not kept: the minimum is 5/);
  assert.ok(!page.state.tags.some((tag) => tag.eventType === "pass_sequence"));

  await page.choose("#minPasses", "0");
  await page.press("p");
  await page.press("l");
  assert.equal(page.state.tags.filter((tag) => tag.eventType === "pass_sequence").length, 1, "Off keeps a 1-pass chain");
});

test("delete pass sequences under a number of passes, all at once, with undo", async () => {
  const tags = [moment("s", 10, "start_of_game"), ...[1, 2, 2, 3, 5].map((count, index) => moment(`p${index}`, 100 + index * 60, "pass_sequence", { passCount: count }))];
  const page = await openPage({ tables: standardTables({ inProgressTags: tags }) });
  await page.openFromLibrary("Test FC vs Rivals");
  assert.equal(page.$("#passCleanup").hidden, false);
  assert.match(page.text("#passCleanupCount"), /3 sequences/);
  await page.choose("#passCleanupMin", "4");
  assert.match(page.text("#passCleanupCount"), /4 sequences/);
  await page.click("#passCleanupButton");
  assert.match(page.dialogs.confirms.at(-1), /4 moments in pass sequences under 4 passes/);
  assert.deepEqual(page.state.tags.filter((tag) => tag.eventType === "pass_sequence").map((tag) => tag.passCount), [5]);
  assert.equal(page.state.isDirty, true);
  await page.click(page.$("#notice .notice-action"));
  assert.equal(page.state.tags.filter((tag) => tag.eventType === "pass_sequence").length, 5, "undo brings them back");
});

test("throw-ins are left off both timelines but stay in the lists", async () => {
  const tags = [moment("s", 10, "start_of_game"), moment("t", 100, "throw_in"), moment("c", 200, "corner")];
  const page = await openPage({ tables: standardTables({ inProgressTags: tags, publishedTags: tags }) });
  await page.openFromLibrary("Test FC vs Rivals");
  assert.equal(page.$$("#timelineBar .timeline-tick").length, 1);
  assert.match(page.$("#timelineBar .timeline-tick").title, /Corner/);
  assert.match(page.text("#tagList"), /Throw-in/);
  await page.tab("watch");
  await page.openInWatch("Test FC vs Okanagan");
  assert.equal(page.$$("#watchTimelineBar .timeline-tick").length, 1);
  assert.match(page.text("#watchGroups"), /Throw-in/);
});

test("fouls and hand balls are Won or Conceded; old quick types and moments carry over", async () => {
  const page = await openPage({
    tables: standardTables({ inProgressTags: [moment("s", 10, "start_of_game"), moment("old", 300, "foul")] }),
    storage: { "touchline.quickTypes": JSON.stringify(["throw_in", "foul", "hand_ball"]) },
  });
  assert.deepEqual([...page.state.quickTypes], ["throw_in", "foul_won", "foul_conceded", "hand_ball_won", "hand_ball_conceded"]);
  assert.equal(page.app.tagEventLabel({ eventType: "foul" }), "Foul", "old moments keep their name");
  for (const value of ["foul_won", "foul_conceded", "hand_ball_won", "hand_ball_conceded"]) {
    assert.ok(page.app.eventTypes.some(([type]) => type === value), value);
  }
  assert.ok(!page.app.eventTypes.some(([type]) => type === "foul" || type === "hand_ball"));
  await page.openFromLibrary("Test FC vs Rivals");
  assert.match(page.$('[data-tag-id="old"] .event-type').selectedOptions[0].textContent, /Foul \(no longer offered\)/);
});

test("Choose clips: filter pass sequences by a minimum number of passes", async () => {
  const tags = [moment("s", 10, "start_of_game"), moment("c", 50, "corner"), ...[3, 5, 8].map((count, index) => moment(`p${index}`, 100 + index * 60, "pass_sequence", { passCount: count }))];
  const page = await openPage({ tables: standardTables({ publishedTags: tags }) });
  await page.tab("watch");
  await page.openInWatch("Test FC vs Okanagan");
  await page.click("#chooseClipsButton");
  const select = page.$("#clipFilterPasses");
  assert.equal(select.hidden, false);
  assert.deepEqual([...select.options].map((option) => option.textContent), ["Any passes", "Pass sequences of 2+", "Pass sequences of 3+", "Pass sequences of 4+", "Pass sequences of 5+", "Pass sequences of 6+", "Pass sequences of 8+"]);
  await page.choose(select, "5");
  assert.match(page.text("#watchEventCount"), /2 of 5/);
  await page.click("#selectAllTypesButton");
  assert.deepEqual([...page.state.watchSelectedIds].sort(), ["p1", "p2"]);
});

test("Stats: average time between pass sequences, per half without the break", async () => {
  const tags = [
    moment("s", 10, "start_of_game"),
    moment("a", 100, "pass_sequence", { passCount: 3 }),
    moment("b", 340, "pass_sequence", { passCount: 4 }),
    moment("h", 1800, "half_time"),
    moment("c", 2000, "pass_sequence", { passCount: 5 }),
    moment("d", 2120, "pass_sequence", { passCount: 3 }),
    moment("e", 2240, "pass_sequence", { passCount: 6 }),
  ];
  const page = await openPage({ tables: standardTables({ publishedTags: tags }) });
  await page.tab("watch");
  await page.openInWatch("Test FC vs Okanagan");
  await page.click("#watchViewStatsButton");
  // Gaps: 240 (1st half); 120 and 120 (2nd half). Average 160 = 02:40.
  assert.match(page.text("#watchStatsView"), /Time between sequences: 02:40 on average \(1st half 04:00, 2nd half 02:00\)/);
});

test("Tag screen Stats view: counts this video's moments as they are, untyped ones left out", async () => {
  const tags = [
    moment("s", 10, "start_of_game"),
    moment("g", 300, "goal"),
    moment("h", 1800, "half_time"),
    moment("c", 2000, "corner"),
    moment("p", 2100, "pass_sequence", { passCount: 4 }),
    moment("u", 2200, "", { done: false, completed: false }),
  ];
  const page = await openPage({ tables: standardTables({ inProgressTags: tags }) });
  await page.openFromLibrary("Test FC vs Rivals");
  await page.click("#tagViewStats");
  assert.equal(page.$("#tagViewStats").getAttribute("aria-pressed"), "true");
  assert.equal(page.window.localStorage.getItem("touchline.tagView"), "stats");
  const stats = page.text("#tagList");
  assert.match(stats, /1 moment without a type isn't counted/);
  assert.match(stats, /Split at Half-time \(30:00\)/);
  assert.match(stats, /Goal\s*1\s*0\s*1/);
  assert.match(stats, /Passing/);
  assert.equal(page.$$("#tagList .stat-play").length, 0, "nothing to play here: plain numbers");

  // It follows edits straight away.
  page.vimeo.current.time = 2500;
  await page.press("y");
  assert.match(page.text("#tagList"), /Goal\s*1\s*1\s*2/);
  await page.click("#tagViewMatch");
  assert.ok(page.$("#tagList .tag-summary-main"));
});
