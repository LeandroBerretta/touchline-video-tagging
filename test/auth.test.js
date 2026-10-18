// UC1 sign in and role routing, UC8 sign out, UC9 password reset.
import { test } from "node:test";
import assert from "node:assert/strict";
import { startApp, settle, ADMIN, VIEWER, NOBODY } from "./helpers/app.js";

async function signIn(page, account, password = account.password) {
  page.$("#loginEmail").value = account.email;
  page.$("#loginPassword").value = password;
  page.$("#loginForm").dispatchEvent(new page.window.Event("submit", { bubbles: true, cancelable: true }));
  await settle(12);
}

test("signed out: only the sign-in card shows", async () => {
  const page = await startApp({ as: null });
  assert.equal(page.$("#loginPanel").hidden, false);
  assert.equal(page.$("#appShell").hidden, true);
  assert.equal(page.$("#signOutButton").hidden, true);
  page.close();
});

test("an admin signs in to the Tag tab with Tag, Watch and Teams tabs", async () => {
  const page = await startApp({ as: null });
  await signIn(page, ADMIN);
  assert.equal(page.state.role, "admin");
  assert.equal(page.$("#appTabs").hidden, false);
  assert.equal(page.$("#tagPanel").hidden, false);
  assert.deepEqual(page.texts(".tab-button"), ["Tag videos", "Watch videos", "Teams"]);
  assert.match(page.text("#signedInLabel"), /ADMIN/);
  page.close();
});

test("a viewer signs in straight to Watch, with no tab bar", async () => {
  const page = await startApp({ as: null });
  await signIn(page, VIEWER);
  assert.equal(page.state.role, "viewer");
  assert.equal(page.$("#appTabs").hidden, true);
  assert.equal(page.$("#watchPanel").hidden, false);
  assert.equal(page.$("#tagPanel").hidden, true);
  page.app.setTab("tag");
  assert.equal(page.$("#tagPanel").hidden, true, "viewers can't switch to Tag");
  page.close();
});

test("a wrong password gets a plain message", async () => {
  const page = await startApp({ as: null });
  await signIn(page, ADMIN, "wrong");
  assert.match(page.text("#loginNotice"), /email or password is incorrect/);
  assert.equal(page.$("#appShell").hidden, true);
  page.close();
});

test("an account without a role is signed straight back out", async () => {
  const page = await startApp({ as: null });
  await signIn(page, NOBODY);
  assert.match(page.text("#loginNotice"), /does not have an app role/);
  assert.equal(page.$("#appShell").hidden, true);
  assert.equal(page.supabase.session, null);
  page.close();
});

test("repeat auth events for the same user don't reset the open tab", async () => {
  const page = await startApp({ as: "admin" });
  await page.tab("watch");
  await page.app.activateSession({ user: { id: ADMIN.id, email: ADMIN.email } });
  await settle();
  assert.equal(page.$("#watchPanel").hidden, false, "still on Watch after a token refresh");
  page.close();
});

test("sign out returns to the sign-in card, signs out this browser only, and clears the password", async () => {
  const page = await startApp({ as: "admin" });
  page.$("#loginPassword").value = "left over";
  await page.click("#signOutButton");
  await settle(8);
  assert.equal(page.$("#loginPanel").hidden, false);
  assert.equal(page.$("#appShell").hidden, true);
  assert.equal(page.$("#loginPassword").value, "");
  assert.match(page.text("#loginNotice"), /Signed out/);
  const call = page.supabase.calls.find((entry) => entry[0] === "signOut");
  assert.equal(call[1].scope, "local");
  page.close();
});

test("sign out still works when Supabase can't be reached", async () => {
  const page = await startApp({ as: "admin" });
  page.window.localStorage.setItem("sb-example-auth-token", "saved session");
  page.supabase.fail("auth", "signOut", "Failed to fetch");
  await page.click("#signOutButton");
  await settle(8);
  assert.equal(page.$("#loginPanel").hidden, false);
  assert.equal(page.window.localStorage.getItem("sb-example-auth-token"), null, "saved sign-in removed");
  page.close();
});

test("Forgot password needs an email, then sends a reset link back to this page", async () => {
  const page = await startApp({ as: null });
  await page.click("#forgotPasswordButton");
  assert.match(page.text("#loginNotice"), /Enter your email address/);
  page.$("#loginEmail").value = ADMIN.email;
  await page.click("#forgotPasswordButton");
  const call = page.supabase.calls.find((entry) => entry[0] === "resetPasswordForEmail");
  assert.equal(call[1], ADMIN.email);
  assert.equal(call[2].redirectTo, "http://localhost/touchline/");
  assert.match(page.text("#loginNotice"), /reset link is on its way/);
  page.close();
});

test("the reset link opens Choose a new password, which checks the two passwords match", async () => {
  const page = await startApp({ as: null });
  page.app.openPasswordDialog();
  assert.equal(page.$("#passwordDialog").open, true);
  page.$("#newPassword").value = "first-password";
  page.$("#confirmPassword").value = "second-password";
  page.$("#passwordForm").dispatchEvent(new page.window.Event("submit", { bubbles: true, cancelable: true }));
  await settle();
  assert.match(page.text("#passwordNotice"), /do not match/);
  page.$("#confirmPassword").value = "first-password";
  page.$("#passwordForm").dispatchEvent(new page.window.Event("submit", { bubbles: true, cancelable: true }));
  await settle();
  assert.equal(page.$("#passwordDialog").open, false);
  assert.ok(page.supabase.calls.some((entry) => entry[0] === "updateUser" && entry[1].password === "first-password"));
  page.close();
});
