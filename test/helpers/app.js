// Loads the real public/index.html and public/app.js into a simulated browser (jsdom), wired to the
// fake Supabase and fake Vimeo player, and exposes the app's top-level functions and state as `app`.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { JSDOM } from "jsdom";
import { createFakeSupabase } from "./fake-supabase.js";
import { installFakeVimeo } from "./fake-vimeo.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const repoRoot = root;
export const html = readFileSync(path.join(root, "public/index.html"), "utf8");
export const appSource = readFileSync(path.join(root, "public/app.js"), "utf8");

// Autosave timers never fire on their own in tests (that made results depend on machine speed).
// Tests check that a save was scheduled (state.autosaveTimer) and then run it with app.autosave().
const testTimings = {
  autosaveDelayMs: 3600000,
  autosaveMaxWaitMs: 7200000,
  autosaveRetryMs: 3600000,
  liveSyncDelayMs: 3600000,
  liveRetryMs: 3600000,
};

function prepareSource(source) {
  let code = source.replace(/^import \{ createClient \} from .*$/m, "const createClient = () => window.__supabase;");
  for (const [name, value] of Object.entries(testTimings)) {
    const pattern = new RegExp(`^const ${name} = [^;]+;`, "m");
    if (!pattern.test(code)) throw new Error(`Test timing constant ${name} not found in app.js`);
    code = code.replace(pattern, `const ${name} = ${value};`);
  }
  const names = new Set([
    ...[...code.matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]),
    ...[...code.matchAll(/^const\s+([A-Za-z_$][\w$]*)\s*=/gm)].map((m) => m[1]),
  ]);
  return `${code}\nwindow.__app = { ${[...names].join(", ")} };\n`;
}

const prepared = prepareSource(appSource);

/** A plain copy of a value from the simulated browser, for deepEqual comparisons. */
export const plain = (value) => JSON.parse(JSON.stringify(value));

export const sleep = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

/** Waits for pending timers, promises and auth events to settle. */
export async function settle(rounds = 6) {
  for (let i = 0; i < rounds; i++) await sleep(0);
}

export const ADMIN = { email: "admin@example.test", password: "admin-pass", id: "11111111-1111-4111-8111-111111111111", role: "admin" };
export const VIEWER = { email: "viewer@example.test", password: "viewer-pass", id: "22222222-2222-4222-8222-222222222222", role: "viewer" };
export const NOBODY = { email: "norole@example.test", password: "x", id: "33333333-3333-4333-8333-333333333333" };

/**
 * Starts the app. `as` signs a user in before the page loads ("admin", "viewer" or null).
 * `tables` seeds the fake database. Returns helpers for driving the page.
 */
export async function startApp({ as = "admin", tables = {}, duration = 5400, confirm = true, storage = {}, usersFunction = true, hash = "" } = {}) {
  const accounts = { [ADMIN.email]: ADMIN, [VIEWER.email]: VIEWER, [NOBODY.email]: NOBODY };
  const signedInAs = as === "admin" ? ADMIN.email : as === "viewer" ? VIEWER.email : null;
  const supabase = createFakeSupabase({ accounts, tables, signedInAs, usersFunction });
  const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true, url: `http://localhost/touchline/${hash}` });
  const { window } = dom;
  window.TOUCHLINE_CONFIG = { url: "https://example.invalid", publishableKey: "test" };
  window.__supabase = supabase.client;
  const vimeo = installFakeVimeo(window, { duration });
  const dialogs = { confirms: [], prompts: [] };
  window.__confirmAnswer = confirm;
  window.confirm = (message) => {
    dialogs.confirms.push(message);
    return typeof window.__confirmAnswer === "function" ? window.__confirmAnswer(message) : window.__confirmAnswer;
  };
  window.prompt = (message, value) => {
    dialogs.prompts.push([message, value]);
    return null;
  };
  // jsdom lacks these browser features; the app uses them for scrolling and dialogs.
  window.Element.prototype.scrollIntoView ??= function scrollIntoView() {};
  window.HTMLDialogElement.prototype.showModal ??= function showModal() { this.open = true; };
  window.HTMLDialogElement.prototype.close ??= function close() { this.open = false; };
  for (const [key, value] of Object.entries(storage)) window.localStorage.setItem(key, value);
  Object.defineProperty(window.navigator, "clipboard", {
    value: { writeText: async (text) => { dialogs.copied = text; } },
    configurable: true,
  });
  const errors = [];
  window.addEventListener("error", (event) => errors.push(event.error || event.message));
  window.console.error = (...args) => errors.push(args.map(String).join(" "));

  window.eval(prepared);
  const app = window.__app;
  await settle(10);

  const doc = window.document;
  const $ = (selector) => doc.querySelector(selector);
  const $$ = (selector) => [...doc.querySelectorAll(selector)];
  const text = (selector) => ($(selector)?.textContent || "").replace(/\s+/g, " ").trim();

  const helpers = {
    window,
    doc,
    app,
    state: app.state,
    supabase,
    db: supabase.db,
    vimeo,
    dialogs,
    errors,
    $,
    $$,
    text,
    settle,
    /** Text of every element matching the selector, whitespace-collapsed. */
    texts: (selector) => $$(selector).map((el) => el.textContent.replace(/\s+/g, " ").trim()),
    click: async (selector) => {
      const element = typeof selector === "string" ? $(selector) : selector;
      if (!element) throw new Error(`Nothing to click: ${selector}`);
      element.click();
      await settle();
    },
    type: async (selector, value) => {
      const element = $(selector);
      element.value = value;
      element.dispatchEvent(new window.Event("input", { bubbles: true }));
      element.dispatchEvent(new window.Event("change", { bubbles: true }));
      await settle();
    },
    choose: async (selector, value) => {
      const element = typeof selector === "string" ? $(selector) : selector;
      element.value = value;
      element.dispatchEvent(new window.Event("change", { bubbles: true }));
      await settle();
    },
    /** Presses a key on the page (not in a field). `code` defaults from the key. */
    press: async (key, { code, shift = false, target } = {}) => {
      const init = { key, code: code || (key.length === 1 && /[a-z]/i.test(key) ? `Key${key.toUpperCase()}` : key), shiftKey: shift, bubbles: true };
      (target || doc.body).dispatchEvent(new window.KeyboardEvent("keydown", init));
      (target || doc.body).dispatchEvent(new window.KeyboardEvent("keyup", init));
      await settle();
    },
    /** Holds Shift, types the digits (as Shift+digit), releases Shift. */
    shiftNumber: async (digits) => {
      doc.body.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Shift", code: "ShiftLeft", shiftKey: true, bubbles: true }));
      for (const digit of String(digits)) {
        doc.body.dispatchEvent(new window.KeyboardEvent("keydown", { key: "!", code: `Digit${digit}`, shiftKey: true, bubbles: true }));
      }
      doc.body.dispatchEvent(new window.KeyboardEvent("keyup", { key: "Shift", code: "ShiftLeft", bubbles: true }));
      await settle();
    },
    /** Opens a saved video from the library and waits for the player. */
    openFromLibrary: async (title) => {
      const button = $$(".saved-video").find((item) => item.querySelector("strong").textContent === title);
      if (!button) throw new Error(`No library entry "${title}"`);
      button.click();
      await settle(12);
    },
    /** Opens a new video through the form and waits for the player. */
    openNewVideo: async (name = "New match", url = "https://vimeo.com/123456789") => {
      $("#videoName").value = name;
      $("#videoUrl").value = url;
      $("#videoForm").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
      await settle(12);
    },
    /** Selects a published video in Watch and waits for the player. */
    openInWatch: async (title) => {
      const card = $$(".watch-video-card").find((item) => item.querySelector("strong").textContent === title);
      if (!card) throw new Error(`No Watch card "${title}"`);
      card.click();
      await settle(12);
    },
    tab: async (name) => {
      $(`.tab-button[data-tab="${name}"]`).click();
      await settle();
    },
    close: () => window.close(),
  };
  return helpers;
}

/** A saved video row as the database stores it. */
export function videoRow({ id, name = "Match", status = "in_progress", tags = [], teamId = null, updated = "2026-10-10T10:00:00Z", published = null, url = "https://vimeo.com/123456789" } = {}) {
  return {
    id,
    name,
    vimeo_url: url,
    status,
    tags,
    team_id: teamId,
    created_at: updated,
    updated_at: updated,
    published_at: status === "published" ? (published || updated) : null,
  };
}

/** A stored moment. */
export function moment(id, seconds, eventType = "", extra = {}) {
  return {
    id,
    timestampSeconds: seconds,
    eventType,
    customEventType: "",
    playerIds: [],
    otherPlayers: "",
    playerNames: "",
    note: "",
    completed: !!eventType,
    done: !!eventType,
    ...extra,
  };
}
