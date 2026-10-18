import { test } from "node:test";
import assert from "node:assert/strict";
import { startApp } from "./helpers/app.js";

test("the app loads and signs an admin in", async () => {
  const page = await startApp({ as: "admin" });
  assert.equal(page.state.role, "admin");
  assert.equal(page.$("#appShell").hidden, false);
  page.close();
});
