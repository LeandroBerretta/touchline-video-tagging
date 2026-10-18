// Teams and squads: add, rename, members, remove/restore, delete rules, and the video's team.
import { test } from "node:test";
import assert from "node:assert/strict";
import { startApp, settle } from "./helpers/app.js";
import { standardTables, TEAM, PLAYERS } from "./fixtures.js";

async function openTeams(page) {
  await page.tab("teams");
}

test("the Teams tab lists teams with player and video counts, players by number, then staff", async () => {
  const page = await startApp({ tables: standardTables() });
  await openTeams(page);
  assert.match(page.text("#teamList"), /Test FC\s*3 players · 3 videos/);
  assert.deepEqual(page.texts("#playerRows .member-label"), ["4Four Example", "9Nine Example", "17Seventeen Example"]);
  assert.deepEqual(page.texts("#staffRows .member-label"), ["Coach ExampleTeam Manager"]);
  page.close();
});

test("add a player and staff member; a clashing shirt number asks first", async () => {
  const page = await startApp({ tables: standardTables(), confirm: false });
  await openTeams(page);
  page.$("#newPlayerNumber").value = "9";
  page.$("#newPlayerName").value = "Clash Example";
  page.$("#addPlayerForm").dispatchEvent(new page.window.Event("submit", { bubbles: true, cancelable: true }));
  await settle(6);
  assert.match(page.dialogs.confirms.at(-1), /#9 is already Nine Example's number/);
  assert.equal(page.db.team_members.some((member) => member.name === "Clash Example"), false);
  page.window.__confirmAnswer = true;
  page.$("#newPlayerNumber").value = "11";
  page.$("#addPlayerForm").dispatchEvent(new page.window.Event("submit", { bubbles: true, cancelable: true }));
  await settle(6);
  assert.equal(page.db.team_members.find((member) => member.name === "Clash Example").shirt_number, 11);
  page.$("#newStaffName").value = "Helper Example";
  page.$("#newStaffRole").value = "Parent";
  page.$("#addStaffForm").dispatchEvent(new page.window.Event("submit", { bubbles: true, cancelable: true }));
  await settle(6);
  assert.equal(page.db.team_members.find((member) => member.name === "Helper Example").kind, "staff");
  page.close();
});

test("removing a player keeps them for history; restoring brings them back to the picker", async () => {
  const page = await startApp({ tables: standardTables() });
  await openTeams(page);
  const row = page.$$("#playerRows .member-row").find((item) => item.textContent.includes("Nine Example"));
  await page.click(row.querySelector(".delete-all"));
  await settle(6);
  assert.equal(page.db.team_members.find((member) => member.id === PLAYERS[0].id).active, false);
  assert.ok(page.text("#removedRows").includes("Nine Example"));
  assert.equal(page.app.teamPlayers(TEAM.id).some((member) => member.id === PLAYERS[0].id), false);
  await page.click(page.$("#removedRows .link-button:last-child"));
  await settle(6);
  assert.equal(page.db.team_members.find((member) => member.id === PLAYERS[0].id).active, true);
  page.close();
});

test("editing a player's name and number saves on Enter", async () => {
  const page = await startApp({ tables: standardTables() });
  await openTeams(page);
  const row = page.$$("#playerRows .member-row").find((item) => item.textContent.includes("Four Example"));
  await page.click(row.querySelector(".link-button"));
  const inputs = page.$$("#playerRows .member-row.editing input");
  inputs[0].value = "5";
  inputs[1].value = "Five Example";
  inputs[1].dispatchEvent(new page.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  await settle(6);
  const saved = page.db.team_members.find((member) => member.id === PLAYERS[2].id);
  assert.equal(saved.name, "Five Example");
  assert.equal(saved.shirt_number, 5);
  page.close();
});

test("add and rename a team; duplicate names get a plain message", async () => {
  const page = await startApp({ tables: standardTables() });
  await openTeams(page);
  page.$("#newTeamName").value = "Test FC";
  page.$("#addTeamForm").dispatchEvent(new page.window.Event("submit", { bubbles: true, cancelable: true }));
  await settle(6);
  assert.match(page.text("#teamsNotice"), /team with that name already exists/);
  page.$("#newTeamName").value = "Reserves";
  page.$("#addTeamForm").dispatchEvent(new page.window.Event("submit", { bubbles: true, cancelable: true }));
  await settle(6);
  assert.ok(page.db.teams.some((team) => team.name === "Reserves"));
  page.$("#teamNameInput").value = "Reserves B";
  page.$("#renameTeamForm").dispatchEvent(new page.window.Event("submit", { bubbles: true, cancelable: true }));
  await settle(6);
  assert.ok(page.db.teams.some((team) => team.name === "Reserves B"));
  page.close();
});

test("a team with videos can't be deleted; an empty one can, with its squad", async () => {
  const page = await startApp({ tables: standardTables() });
  await openTeams(page);
  await page.click("#deleteTeamButton");
  assert.match(page.text("#teamsNotice"), /still has 3 videos/);
  assert.ok(page.db.teams.some((team) => team.id === TEAM.id));

  page.$("#newTeamName").value = "Temporary";
  page.$("#addTeamForm").dispatchEvent(new page.window.Event("submit", { bubbles: true, cancelable: true }));
  await settle(6);
  page.$("#newPlayerName").value = "Temp Player";
  page.$("#addPlayerForm").dispatchEvent(new page.window.Event("submit", { bubbles: true, cancelable: true }));
  await settle(6);
  await page.click("#deleteTeamButton");
  await settle(6);
  assert.equal(page.db.teams.some((team) => team.name === "Temporary"), false);
  assert.equal(page.db.team_members.some((member) => member.name === "Temp Player"), false);
  page.close();
});

test("viewers can't open the Teams screen and only ever receive players", async () => {
  const page = await startApp({ as: "viewer", tables: standardTables() });
  page.app.setTab("teams");
  assert.equal(page.$("#teamsPanel").hidden, true);
  assert.ok(page.state.members.every((member) => member.kind === "player"), "staff never reach a viewer");
  page.close();
});
