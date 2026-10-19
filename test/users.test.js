// Users tab: admins invite people by email, change roles, resend invites, send password resets and
// remove accounts through the admin-users Edge Function (a stand-in with the same rules in tests).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { startApp, repoRoot, ADMIN, VIEWER } from "./helpers/app.js";
import { standardTables } from "./fixtures.js";

const pages = [];
after(() => pages.forEach((page) => page.close()));
async function openPage(options = {}) {
  const page = await startApp({ tables: standardTables(), ...options });
  pages.push(page);
  return page;
}

const row = (page, email) => page.$$(".user-row").find((item) => item.querySelector(".user-email")?.textContent.startsWith(email));

async function openUsers(page) {
  await page.tab("users");
  await page.settle(6);
}

test("the Users tab lists everyone with role and status; admins only", async () => {
  const page = await openPage();
  await openUsers(page);
  assert.equal(page.$("#usersPanel").hidden, false);
  assert.equal(page.$("#usersUnavailable").hidden, true);
  assert.match(page.text("#usersSummary"), /3 people · 1 admin · 1 viewer/);
  assert.match(row(page, ADMIN.email).textContent, /\(you\).*Admin.*Active.*You can't remove yourself/);
  assert.match(row(page, VIEWER.email).textContent, /Viewer.*Active/);
  assert.match(row(page, "norole@example.test").textContent, /None.*No access/);
  assert.ok(row(page, VIEWER.email).querySelector("button"), "others can be edited");

  await page.type("#userSearch", "viewer");
  assert.deepEqual(page.$$(".user-row:not(.user-head)").map((item) => item.querySelector(".user-email").textContent), [VIEWER.email]);

  const viewer = await openPage({ as: "viewer" });
  assert.equal(viewer.$("#appTabs").hidden, true);
  viewer.app.setTab("users");
  assert.equal(viewer.$("#usersPanel").hidden, true, "viewers are sent to Watch");
});

test("invite: the person is added as Invited, with a link back to this page; duplicates are refused", async () => {
  const page = await openPage();
  await openUsers(page);
  await page.type("#inviteEmail", "New.Parent@Example.com");
  await page.choose("#inviteRole", "viewer");
  page.$("#inviteForm").dispatchEvent(new page.window.Event("submit", { bubbles: true, cancelable: true }));
  await page.settle(6);
  assert.match(page.text("#usersNotice"), /Invite sent to New.Parent@Example.com as a viewer/);
  assert.equal(page.$("#inviteEmail").value, "");
  assert.match(row(page, "new.parent@example.com").textContent, /Viewer.*Invited, not signed in yet.*Never.*Resend invite/);
  assert.deepEqual(page.supabase.sentEmails.at(-1), ["invite", "new.parent@example.com", "http://localhost/touchline/"]);
  assert.ok(page.db.app_users.some((item) => item.role === "viewer" && page.supabase.authUsers.find((user) => user.id === item.user_id)?.email === "new.parent@example.com"));

  await page.click(row(page, "new.parent@example.com").querySelector("button"));
  await page.settle();
  assert.match(page.text("#usersNotice"), /Invite sent again/);

  await page.type("#inviteEmail", VIEWER.email);
  page.$("#inviteForm").dispatchEvent(new page.window.Event("submit", { bubbles: true, cancelable: true }));
  await page.settle(6);
  assert.match(page.text("#usersNotice"), /already has an account/);
});

test("edit: change a role, send a password reset, remove a user", async () => {
  const page = await openPage();
  await openUsers(page);
  await page.click(row(page, VIEWER.email).querySelector("button"));
  assert.ok(page.$("#userDialog").open);
  assert.equal(page.text("#userDialogEmail"), VIEWER.email);
  assert.ok(page.$('input[name="userRole"][value="viewer"]').checked);

  page.$('input[name="userRole"][value="admin"]').checked = true;
  page.$("#userForm").dispatchEvent(new page.window.Event("submit", { bubbles: true, cancelable: true }));
  await page.settle(6);
  assert.equal(page.$("#userDialog").open, false);
  assert.equal(page.db.app_users.find((item) => item.user_id === VIEWER.id).role, "admin");
  assert.match(page.text("#usersNotice"), /is now an admin/);
  assert.match(page.text("#usersSummary"), /2 admins · 0 viewers/);

  await page.click(row(page, VIEWER.email).querySelector("button"));
  await page.click("#userResetButton");
  assert.deepEqual(page.supabase.sentEmails.at(-1), ["reset", VIEWER.email, "http://localhost/touchline/"]);
  assert.match(page.text("#usersNotice"), /password reset email is on its way/);

  await page.click(row(page, VIEWER.email).querySelector("button"));
  await page.click("#userRemoveButton");
  assert.match(page.dialogs.confirms.at(-1), /Remove viewer@example.test\?/);
  assert.equal(row(page, VIEWER.email), undefined);
  assert.ok(!page.supabase.authUsers.some((user) => user.id === VIEWER.id));
  assert.ok(!page.db.app_users.some((item) => item.user_id === VIEWER.id), "the role goes with the account");
  assert.match(page.text("#usersNotice"), /was removed/);
});

test("removing is cancelled when not confirmed; the server refuses removing or demoting yourself", async () => {
  const page = await openPage({ confirm: false });
  await openUsers(page);
  await page.click(row(page, VIEWER.email).querySelector("button"));
  await page.click("#userRemoveButton");
  assert.ok(row(page, VIEWER.email), "still there");

  await assert.rejects(page.app.callUsersFunction({ action: "remove", userId: ADMIN.id }), /can't remove your own account/);
  await assert.rejects(page.app.callUsersFunction({ action: "setRole", userId: ADMIN.id, role: "viewer" }), /can't take away your own admin role/);
});

test("without the Edge Function deployed, the tab explains the one-time setup", async () => {
  const page = await openPage({ usersFunction: false });
  await openUsers(page);
  assert.equal(page.$("#usersUnavailable").hidden, false);
  assert.equal(page.$("#usersContent").hidden, true);
  assert.match(page.text("#usersUnavailable"), /admin-users/);
});

test("arriving from an invite link asks the new person to choose a password", async () => {
  const page = await openPage({ as: "viewer", hash: "#access_token=x&type=invite" });
  assert.ok(page.$("#passwordDialog").open);
  assert.match(page.text("#passwordHeading"), /Welcome to Touchline/);
  const normal = await openPage({ as: "viewer" });
  assert.equal(normal.$("#passwordDialog").open, false);
});

test("the Edge Function checks the caller is an admin and keeps the service key out of the page", () => {
  const source = readFileSync(path.join(repoRoot, "supabase/functions/admin-users/index.ts"), "utf8");
  assert.match(source, /Deno\.env\.get\("SUPABASE_SECRET_KEYS"\)/);
  assert.match(source, /Deno\.env\.get\("SUPABASE_SERVICE_ROLE_KEY"\)/);
  assert.match(source, /role !== "admin"\) return reply\(\{ error: "Only admins can manage users\." \}, 403\)/);
  assert.match(source, /userId === caller\.user\.id\) return reply/);
  assert.match(source, /asCaller\.from\("app_users"\)/, "the role is read as the caller");
  const page = readFileSync(path.join(repoRoot, "public/app.js"), "utf8");
  assert.doesNotMatch(page, /service_role|SERVICE_ROLE/i);
});
