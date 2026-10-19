// Checks that need no browser: page/code consistency, database scripts, secrets and private data.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { repoRoot, html, appSource } from "./helpers/app.js";

const read = (file) => readFileSync(path.join(repoRoot, file), "utf8");
const tracked = execFileSync("git", ["ls-files"], { cwd: repoRoot, encoding: "utf8" }).split("\n").filter(Boolean);

test("every element the app looks up by id exists in the page, and ids are unique", () => {
  const used = new Set([...appSource.matchAll(/\$\("#([A-Za-z][\w-]*)"\)/g)].map((m) => m[1]));
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const missing = [...used].filter((id) => !ids.includes(id));
  assert.deepEqual(missing, [], `missing ids: ${missing.join(", ")}`);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert.deepEqual(duplicates, [], `duplicate ids: ${duplicates.join(", ")}`);
});

test("the page loads config.js before app.js, and Supabase is pinned to an exact version", () => {
  assert.ok(html.indexOf('src="./config.js"') < html.indexOf('src="./app.js"'));
  assert.match(appSource, /@supabase\/supabase-js@\d+\.\d+\.\d+"/);
});

test("event types: unique values, and every quick type and marker exists", () => {
  const values = [...appSource.matchAll(/^\s+\["([a-z_]*)", "[^"]+"\],?$/gm)].map((m) => m[1]);
  assert.ok(values.length > 25);
  assert.equal(new Set(values).size, values.length, "duplicate event types");
  const quick = appSource.match(/const defaultQuickTypes = \[([^\]]+)\]/)[1].match(/"([a-z_]+)"/g).map((v) => v.slice(1, -1));
  const markers = appSource.match(/const markerTypes = new Set\(\[([^\]]+)\]\)/)[1].match(/"([a-z_]+)"/g).map((v) => v.slice(1, -1));
  for (const value of [...quick, ...markers]) assert.ok(values.includes(value), `${value} is not an event type`);
});

test("every database table has row-level security and no anonymous access", () => {
  const sqlFiles = readdirSync(path.join(repoRoot, "database")).filter((file) => file.endsWith(".sql"));
  const all = sqlFiles.map((file) => read(`database/${file}`)).join("\n");
  const tables = [...all.matchAll(/create table if not exists public\.(\w+)/g)].map((m) => m[1]);
  assert.deepEqual(tables.sort(), ["app_users", "playlists", "team_members", "teams", "videos"]);
  for (const table of tables) {
    assert.match(all, new RegExp(`alter table public\\.${table} enable row level security`), `${table} has no RLS`);
    assert.match(all, new RegExp(`revoke all on public\\.${table} from anon, authenticated`), `${table} keeps default grants`);
    assert.doesNotMatch(all, new RegExp(`grant [^;]* on public\\.${table} to [^;]*anon`), `${table} is granted to anon`);
    assert.match(all, new RegExp(`on public\\.${table}\\s+for select`), `${table} has no read policy`);
  }
});

test("viewers are limited to published videos, players and playlists of published videos", () => {
  const schema = read("database/001_schema.sql");
  assert.match(schema, /status = 'published'\s+and exists \(\s+select 1 from public\.app_users\s+where user_id = \(select auth\.uid\(\)\)\s+and role = 'viewer'/);
  assert.match(read("database/003_playlists.sql"), /videos\.status = 'published'/);
  assert.match(read("database/004_teams.sql"), /kind = 'player'\s+and exists/);
});

test("database scripts hold structure only: no squad lists, and role assignment stays a template", () => {
  for (const file of readdirSync(path.join(repoRoot, "database")).filter((name) => name.endsWith(".sql"))) {
    assert.doesNotMatch(read(`database/${file}`), /insert into public\.(team_members|teams)\b/i, `${file} contains squad data`);
  }
  const roles = read("database/002_assign_roles.sql");
  assert.match(roles, /'ADMIN-USER-UUID'/);
  assert.match(roles, /'VIEWER-USER-UUID'/);
});

test("no secrets or private config are committed", () => {
  assert.ok(!tracked.includes("public/config.js"), "public/config.js must never be committed");
  assert.match(read(".gitignore"), /^\/public\/config\.js$/m);
  const textFiles = tracked.filter((file) => /\.(js|ts|json|md|sql|html|css|yml|yaml)$/.test(file) && file !== "package-lock.json");
  for (const file of textFiles) {
    const content = read(file);
    assert.doesNotMatch(content, /sb_secret_[A-Za-z0-9]/, `${file} contains a Supabase secret key`);
    assert.doesNotMatch(content, /eyJhbGciOi[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/, `${file} contains a JWT`);
    assert.doesNotMatch(content, /https:\/\/[a-z0-9]{20}\.supabase\.co/, `${file} contains a real Supabase project URL`);
  }
});

test("the deploy workflow runs the tests and builds config.js from secrets", () => {
  const workflow = read(".github/workflows/pages.yml");
  assert.match(workflow, /npm test/);
  assert.match(workflow, /secrets\.SUPABASE_URL/);
  assert.match(workflow, /secrets\.SUPABASE_PUBLISHABLE_KEY/);
});

test("the docs the team relies on exist", () => {
  for (const file of ["README.md", "docs/ROADMAP.md", "docs/USE_CASE_FLOWS.md", "database/README.md"]) {
    assert.ok(existsSync(path.join(repoRoot, file)), `${file} is missing`);
  }
  const dbReadme = read("database/README.md");
  for (const script of ["001_schema.sql", "002_assign_roles.sql", "003_playlists.sql", "004_teams.sql", "005_users.sql"]) {
    assert.ok(dbReadme.includes(script), `database/README.md doesn't mention ${script}`);
  }
});
