// Pure logic: time formats, Vimeo links, completeness, saving shape, player matching, durations.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startApp, plain } from "./helpers/app.js";

let page;
let app;
before(async () => {
  page = await startApp({ as: null });
  app = page.app;
});
after(() => page.close());

test("formatTime shows mm:ss, and h:mm:ss past an hour", () => {
  assert.equal(app.formatTime(0), "00:00");
  assert.equal(app.formatTime(65.9), "01:05");
  assert.equal(app.formatTime(3725), "01:02:05");
  assert.equal(app.formatTime(-4), "00:00");
});

test("parseTime accepts seconds, m:ss and h:mm:ss, and rejects nonsense", () => {
  assert.equal(app.parseTime("75"), 75);
  assert.equal(app.parseTime("12:45"), 765);
  assert.equal(app.parseTime(" 1:02:30 "), 3750);
  for (const bad of ["", "12:75", "1:2:3:4", "ab", "-5"]) assert.equal(app.parseTime(bad), null, bad);
});

test("parseVimeoUrl reads public, private and player links", () => {
  assert.deepEqual(plain(app.parseVimeoUrl("https://vimeo.com/123456789")), { id: "123456789", hash: "" });
  assert.deepEqual(plain(app.parseVimeoUrl("https://vimeo.com/123456789/abc123def")), { id: "123456789", hash: "abc123def" });
  assert.deepEqual(plain(app.parseVimeoUrl("https://player.vimeo.com/video/42?h=ff00")), { id: "42", hash: "ff00" });
  assert.throws(() => app.parseVimeoUrl("http://vimeo.com/1"), /https/);
  assert.throws(() => app.parseVimeoUrl("https://youtube.com/watch?v=1"), /Vimeo/);
  assert.throws(() => app.parseVimeoUrl("not a link"), /valid Vimeo/);
});

test("a moment is complete with a type, and Other needs a name", () => {
  assert.equal(app.isComplete({ eventType: "goal" }), true);
  assert.equal(app.isComplete({ eventType: "" }), false);
  assert.equal(app.isComplete({ eventType: "other", customEventType: "  " }), false);
  assert.equal(app.isComplete({ eventType: "other", customEventType: "Press" }), true);
  assert.equal(app.isDone({ eventType: "goal", done: true }), true);
  assert.equal(app.isDone({ eventType: "", done: true }), false);
});

test("moments saved by the old Mark-button bug are cleaned to untyped", () => {
  const broken = { id: "x", eventType: { isTrusted: true }, done: true };
  assert.equal(app.cleanTag(broken).eventType, "");
  assert.equal(app.normalizeTag(broken).eventType, "");
  assert.equal(app.tagEventLabel(broken), "Unclassified moment");
  assert.equal(app.markerTypes.has("half_time"), true);
});

test("labels use the event list, custom names and readable fallbacks", () => {
  assert.equal(app.tagEventLabel({ eventType: "shot_on_target" }), "Shot on target");
  assert.equal(app.tagEventLabel({ eventType: "other", customEventType: "Press trigger" }), "Press trigger");
  assert.equal(app.tagEventLabel({ eventType: "made_up_type" }), "made up type");
});

test("serializeTag stores ids, names as text, and the completed/done flags", () => {
  page.state.memberById = new Map([["p9", { id: "p9", name: "Nine", number: 9, active: true }]]);
  const saved = app.serializeTag({ id: "a", timestampSeconds: 10, eventType: "goal", playerIds: ["p9"], otherPlayers: " Guest ,  ", note: " note ", done: true });
  assert.deepEqual(plain(saved.playerIds), ["p9"]);
  assert.equal(saved.otherPlayers, "Guest");
  assert.equal(saved.playerNames, "Nine, Guest");
  assert.equal(saved.note, "note");
  assert.equal(saved.completed, true);
  assert.equal(saved.done, true);
  assert.equal(app.serializeTag({ id: "b", timestampSeconds: 1, eventType: "corner", customEventType: "x" }).customEventType, "");
});

test("old typed names link to the squad by name, keeping removed players and leaving staff as text", () => {
  page.state.members = [
    { id: "p1", teamId: "t1", name: "Alex Example", kind: "player", number: 9, active: true },
    { id: "p2", teamId: "t1", name: "Robin Former", kind: "player", number: 2, active: false },
    { id: "s1", teamId: "t1", name: "Casey Coach", kind: "staff", number: null, active: true },
  ];
  page.state.memberById = new Map(page.state.members.map((m) => [m.id, m]));
  const { ids, others } = app.tagPlayers({ playerNames: "alex  EXAMPLE, Opponent, robin former, Casey Coach" }, "t1");
  assert.deepEqual(plain(ids), ["p1", "p2"]);
  assert.deepEqual(plain(others), ["Opponent", "Casey Coach"]);
  assert.deepEqual(plain(app.tagPlayers({ playerNames: "Alex Example" }, null)), { ids: [], others: ["Alex Example"] });
  assert.deepEqual(plain(app.teamPlayers("t1").map((m) => m.number)), [9], "picker lists active players only");
});

test("playlist running time counts overlapping clips once", () => {
  const at = (s) => ({ timestampSeconds: s });
  assert.equal(app.playlistSeconds([at(100), at(300), at(500)], 20), 60);
  assert.equal(app.playlistSeconds([at(110), at(100), at(300)], 20), 50);
  assert.equal(app.playlistSeconds([at(1)], 20), 20);
  assert.equal(app.playlistSeconds([], 20), 0);
});

test("a video with only markers stays Not started; a live match without a video is Waiting for video", () => {
  const url = "https://vimeo.com/1";
  assert.equal(app.librarySection({ status: "in_progress", vimeoUrl: url, tags: [{ eventType: "start_of_game" }] }), "queued");
  assert.equal(app.librarySection({ status: "in_progress", vimeoUrl: url, tags: [{ eventType: "" }] }), "in_progress");
  assert.equal(app.librarySection({ status: "published", vimeoUrl: url, tags: [] }), "published");
  assert.equal(app.librarySection({ status: "in_progress", vimeoUrl: "", tags: [{ eventType: "corner" }] }), "waiting");
});

test("friendly errors for common Supabase messages", () => {
  assert.match(app.friendlyError({ message: "Invalid login credentials" }), /email or password is incorrect/);
  assert.match(app.friendlyError({ message: "Failed to fetch" }), /Could not reach the server/);
  assert.match(app.friendlyError({ message: "new row violates row-level security policy" }), /permission/);
  assert.match(app.friendlyError({ message: 'duplicate key value violates unique constraint "teams_name_key"' }), /team with that name/);
  assert.match(app.friendlyError({ message: "Reading roles: permission denied for table app_users" }), /005_users.sql/);
  assert.equal(app.friendlyError({ message: "Something else" }), "Something else");
});
