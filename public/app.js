import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const $ = (selector) => document.querySelector(selector);
const config = window.TOUCHLINE_CONFIG;
const supabase = config?.url && config?.publishableKey
  ? createClient(config.url, config.publishableKey)
  : null;
const eventTypes = [
  ["", "Choose event type…"],
  ["start_of_game", "Start of game"],
  ["goal", "Goal"],
  ["assist", "Assist"],
  ["shot_on_target", "Shot on target"],
  ["shot_off_target", "Shot off target"],
  ["save", "Save"],
  ["pass", "Pass"],
  ["cross", "Cross"],
  ["carry", "Carry"],
  ["dribble", "Dribble"],
  ["header", "Header"],
  ["throw_in", "Throw-in"],
  ["goal_kick", "Goal kick"],
  ["kick_off", "Kick-off"],
  ["foul", "Foul"],
  ["hand_ball", "Hand ball"],
  ["yellow_card", "Yellow card"],
  ["red_card", "Red card"],
  ["penalty", "Penalty"],
  ["free_kick", "Free kick"],
  ["corner", "Corner"],
  ["offside", "Offside"],
  ["tackle", "Tackle"],
  ["interception", "Interception"],
  ["clearance", "Clearance"],
  ["block", "Block"],
  ["substitution", "Substitution"],
  ["half_time", "Half-time"],
  ["end_of_game", "End of game"],
  ["other", "Other"],
];
// Markers frame the match (halves for stats) and are not counted as events.
const markerTypes = new Set(["start_of_game", "half_time", "end_of_game"]);
// New videos get a Start of game moment here; admins move it with Edit if the game starts elsewhere.
const defaultStartOfGameSeconds = 10;
// Shown as one-tap buttons on moments that still need a type.
const defaultQuickTypes = ["throw_in", "kick_off", "corner", "shot_off_target", "shot_on_target", "goal"];
// Each quick type gets a key along the top letter row, in order; admins choose up to nine types.
const quickKeys = ["q", "w", "e", "r", "t", "y", "u", "i", "o"];
const quickTypesStorageKey = "touchline.quickTypes";
const pauseOnMarkStorageKey = "touchline.pauseOnMark";
const tagViewStorageKey = "touchline.tagView";
const watchChoosingStorageKey = "touchline.watchChoosing";
const markOffsetChoices = [0, 3, 5, 10];
const markOffsetStorageKey = "touchline.markOffsetSeconds";
const libraryHiddenStorageKey = "touchline.libraryHidden";
const seekStepSeconds = 5;
// Watch playback starts a little before each moment so viewers see the build-up.
const watchLeadSeconds = 3;
const clipLengthChoices = [5, 10, 15, 20, 30, 45];
const clipLengthStorageKey = "touchline.clipLengthSeconds";
const errorMessages = [
  [/invalid login credentials/i, "The email or password is incorrect."],
  [/email not confirmed/i, "This email address has not been confirmed yet. Use the link in the confirmation email first."],
  [/failed to fetch|networkerror|load failed/i, "Could not reach the server. Check your internet connection and try again."],
  [/jwt expired|refresh token/i, "Your session has expired. Sign out and sign in again."],
  [/row-level security|permission denied/i, "Your account does not have permission to do that."],
  [/rate limit|too many requests/i, "Too many attempts. Wait a minute and try again."],
  [/password should be at least/i, "That password is too short. Use at least 8 characters."],
  [/duplicate key value.*teams_name/i, "A team with that name already exists."],
];

const state = {
  video: null,
  player: null,
  watchPlayer: null,
  watchLoadId: 0,
  selectedWatchId: "",
  watchReady: false,
  watchSelectedIds: new Set(),
  watchExpandedTypes: new Set(),
  playlist: null,
  playlists: [],
  playlistsAvailable: true,
  linkedPlaylistId: "",
  watchView: "events",
  quickTypes: [...defaultQuickTypes],
  lastMarkedId: null,
  numberBuffer: "",
  shiftNumber: false,
  bulkIds: new Set(),
  tagView: "match",
  watchTeamFilter: "",
  watchDuration: 0,
  watchChoosing: false,
  expandedTagId: "",
  changeCount: 0,
  dirtySince: null,
  autosaveTimer: null,
  autosaving: false,
  autosaveFailed: false,
  teams: [],
  members: [],
  memberById: new Map(),
  teamsAvailable: true,
  selectedTeamId: "",
  editingMemberId: "",
  activeTab: "tag",
  activeRecord: null,
  records: [],
  tags: [],
  playerReady: false,
  videoDuration: 0,
  isDirty: false,
  isSaving: false,
  role: null,
  sessionUserId: null,
  // Done groups start folded; this holds the ones the admin has opened.
  expandedGroups: new Set(),
};

function showNotice(selector, message, kind = "", action = null) {
  const notice = $(selector);
  notice.textContent = message;
  notice.className = `notice ${kind}`.trim();
  if (action) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "notice-action";
    button.textContent = action.label;
    button.addEventListener("click", action.onClick, { once: true });
    notice.append(" ", button);
  }
}

function notify(message, kind = "", action = null) {
  showNotice("#notice", message, kind, action);
}

function notifyWatch(message, kind = "", action = null) {
  showNotice("#watchNotice", message, kind, action);
}

function friendlyError(error) {
  const message = error?.message || String(error);
  const match = errorMessages.find(([pattern]) => pattern.test(message));
  return match ? match[1] : message;
}

// Zoom magnifies the Vimeo player box with a CSS transform and pans inside it; the video itself
// lives in Vimeo's cross-origin frame, so this is the only zoom available. The view is stored as a
// zoom factor plus the visible centre (u, v) in 0–1 frame coordinates, so it survives resizing and
// full screen. While zoomed, a transparent layer takes drags (pan), wheel (zoom) and taps (play/pause).
const zoomSteps = [1, 1.5, 2, 3, 4];
const maxZoom = zoomSteps[zoomSteps.length - 1];

function createZoom(frameElement, controls, onTap) {
  const view = { zoom: 1, u: 0.5, v: 0.5 };
  const layer = document.createElement("div");
  layer.className = "zoom-pan";
  layer.hidden = true;
  layer.title = "Drag to look around, scroll to zoom, click to play or pause";

  function apply() {
    const half = 0.5 / view.zoom;
    view.u = Math.min(1 - half, Math.max(half, view.u));
    view.v = Math.min(1 - half, Math.max(half, view.v));
    const iframe = frameElement.querySelector("iframe");
    if (iframe) {
      iframe.style.transform = view.zoom === 1
        ? ""
        : `translate(${-(view.u * view.zoom - 0.5) * 100}%, ${-(view.v * view.zoom - 0.5) * 100}%) scale(${view.zoom})`;
    }
    if (!layer.isConnected) frameElement.append(layer);
    layer.hidden = view.zoom === 1;
    controls.level.textContent = `${Math.round(view.zoom * 100)}%`;
    controls.zoomOut.disabled = view.zoom <= 1;
    controls.zoomIn.disabled = view.zoom >= maxZoom;
    controls.reset.disabled = view.zoom === 1;
  }

  // Zooms to a new factor while keeping the point at (sx, sy) of the frame (0–1) in the same place.
  function setZoom(zoom, sx = 0.5, sy = 0.5) {
    const pointU = view.u + (sx - 0.5) / view.zoom;
    const pointV = view.v + (sy - 0.5) / view.zoom;
    view.zoom = Math.min(maxZoom, Math.max(1, zoom));
    view.u = pointU - (sx - 0.5) / view.zoom;
    view.v = pointV - (sy - 0.5) / view.zoom;
    apply();
  }

  function step(direction) {
    const next = direction > 0
      ? zoomSteps.find((level) => level > view.zoom + 0.01)
      : [...zoomSteps].reverse().find((level) => level < view.zoom - 0.01);
    setZoom(next ?? (direction > 0 ? maxZoom : 1));
  }

  let drag = null;
  layer.addEventListener("pointerdown", (event) => {
    layer.setPointerCapture(event.pointerId);
    drag = { x: event.clientX, y: event.clientY, u: view.u, v: view.v, moved: false };
  });
  layer.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    if (!drag.moved) return;
    const box = frameElement.getBoundingClientRect();
    view.u = drag.u - dx / (box.width * view.zoom);
    view.v = drag.v - dy / (box.height * view.zoom);
    apply();
  });
  layer.addEventListener("pointerup", () => {
    if (drag && !drag.moved) onTap();
    drag = null;
  });
  layer.addEventListener("pointercancel", () => { drag = null; });
  layer.addEventListener("wheel", (event) => {
    event.preventDefault();
    const box = frameElement.getBoundingClientRect();
    setZoom(view.zoom * Math.exp(-event.deltaY * 0.002),
      (event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height);
  }, { passive: false });

  controls.zoomIn.addEventListener("click", () => step(1));
  controls.zoomOut.addEventListener("click", () => step(-1));
  controls.reset.addEventListener("click", () => setZoom(1));

  return {
    zoomIn: () => step(1),
    zoomOut: () => step(-1),
    reset() {
      view.zoom = 1;
      view.u = 0.5;
      view.v = 0.5;
      apply();
    },
  };
}

function setTab(tab) {
  if (state.role === "viewer" && tab !== "watch") tab = "watch";
  exitStage();
  state.activeTab = tab;
  for (const button of document.querySelectorAll(".tab-button")) {
    const active = button.dataset.tab === tab;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  }
  $("#tagPanel").hidden = tab !== "tag";
  $("#watchPanel").hidden = tab !== "watch";
  $("#teamsPanel").hidden = tab !== "teams";
  if (tab === "teams") renderTeams();
}

function formatTime(seconds) {
  const value = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor(value / 60) % 60;
  const remainingSeconds = value % 60;
  return hours
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`
    : `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function parseVimeoUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Enter a valid Vimeo video link.");
  }

  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || !["vimeo.com", "www.vimeo.com", "player.vimeo.com"].includes(hostname)) {
    throw new Error("Use a Vimeo link beginning with https://vimeo.com or https://player.vimeo.com.");
  }

  const match = url.pathname.match(/(?:^|\/)(?:video\/)?(\d+)(?:\/([^/]+))?\/?$/);
  if (!match) throw new Error("That link does not contain a Vimeo video ID.");

  const hash = url.searchParams.get("h") || (match[2] && !/^\d+$/.test(match[2]) ? match[2] : "");
  return { id: match[1], hash };
}

function byTime(first, second) {
  return first.timestampSeconds - second.timestampSeconds;
}

function isComplete(tag) {
  if (!tag?.eventType) return false;
  return tag.eventType !== "other" || !!tag.customEventType?.trim();
}

// A moment is "done" when the admin has ticked it off; it then leaves the To do list.
// It needs a type to stay done, so clearing the type sends it back to To do.
function isDone(tag) {
  return !!tag.done && isComplete(tag);
}

// A moment's event type is always a string. Moments saved by an earlier bug can hold something else
// (the Mark moment click itself); treat those as untyped so they can be fixed instead of breaking pages.
function cleanTag(tag) {
  return typeof tag?.eventType === "string" || !tag ? tag : { ...tag, eventType: "" };
}

function normalizeTag(tag) {
  const normalized = {
    ...tag,
    eventType: typeof tag.eventType === "string" ? tag.eventType : "",
    customEventType: tag.customEventType || "",
    playerNames: tag.playerNames || "",
    note: tag.note || "",
  };
  // Moments saved before the Done list existed count as done once they have a type.
  normalized.done = typeof tag.done === "boolean" ? tag.done : isComplete(normalized);
  return normalized;
}

function serializeTag(tag) {
  const ids = Array.isArray(tag.playerIds) ? tag.playerIds : null;
  return {
    id: tag.id,
    timestampSeconds: tag.timestampSeconds,
    eventType: tag.eventType || "",
    customEventType: tag.eventType === "other" ? (tag.customEventType || "").trim() : "",
    playerIds: ids ?? [],
    otherPlayers: splitNames(tag.otherPlayers).join(", "),
    // Kept as plain text so viewers and older code can always show who was involved.
    playerNames: ids ? playersText(ids, splitNames(tag.otherPlayers)) : (tag.playerNames || "").trim(),
    note: (tag.note || "").trim(),
    completed: isComplete(tag),
    done: isDone(tag),
  };
}

// ---- Teams and players ----
// A moment names squad players by id (playerIds) plus any other names as text (otherPlayers),
// e.g. opponents. playerNames holds the combined text for display.

function splitNames(text) {
  return (text || "").split(",").map((name) => name.trim().replace(/\s+/g, " ")).filter(Boolean);
}

function normalizeName(name) {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function memberLabel(member) {
  return member.number === null || member.number === undefined ? member.name : `#${member.number} ${member.name}`;
}

function teamPlayers(teamId, { includeRemoved = false } = {}) {
  return state.members
    .filter((member) => member.teamId === teamId && member.kind === "player" && (includeRemoved || member.active))
    .sort((first, second) => (first.number ?? 1e9) - (second.number ?? 1e9) || first.name.localeCompare(second.name));
}

function playersText(ids, others) {
  const names = ids.map((id) => state.memberById.get(id)?.name).filter(Boolean);
  return [...names, ...others].join(", ");
}

// Who a moment names. Moments saved before squads existed only have playerNames text: names that
// match the team's squad (ignoring case and spaces) count as those players, the rest as other names.
function tagPlayers(tag, teamId) {
  if (Array.isArray(tag.playerIds)) return { ids: tag.playerIds, others: splitNames(tag.otherPlayers) };
  const squad = teamId ? teamPlayers(teamId, { includeRemoved: true }) : [];
  const ids = [];
  const others = [];
  for (const name of splitNames(tag.playerNames)) {
    const match = squad.find((member) => normalizeName(member.name) === normalizeName(name));
    if (!match) others.push(name);
    else if (!ids.includes(match.id)) ids.push(match.id);
  }
  return { ids, others };
}

function withPlayers(tag, teamId) {
  const { ids, others } = tagPlayers(tag, teamId);
  return { ...tag, playerIds: ids, otherPlayers: others.join(", ") };
}

function activeTeamId() {
  return state.teamsAvailable ? ($("#videoTeam").value || null) : null;
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function setDirty() {
  state.isDirty = true;
  state.changeCount++;
  state.dirtySince ??= Date.now();
  $("#saveHint").textContent = "Unsaved changes";
  refreshActions();
  scheduleAutosave();
}

// ---- Autosave ----
// In progress videos save themselves a few seconds after the last change (and at least every 30 seconds
// while changes keep coming), so a crash or a closed laptop never loses a match of tagging. Published
// videos are never autosaved: viewers only see changes when the admin re-publishes.
const autosaveDelayMs = 4000;
const autosaveMaxWaitMs = 30000;
const autosaveRetryMs = 30000;

function autosaveEligible() {
  return !!supabase && state.role === "admin" && !!state.activeRecord
    && state.activeRecord.status !== "published" && state.playerReady;
}

function scheduleAutosave() {
  if (!autosaveEligible()) return;
  clearTimeout(state.autosaveTimer);
  const waited = Date.now() - (state.dirtySince ?? Date.now());
  state.autosaveTimer = setTimeout(autosave, Math.max(0, Math.min(autosaveDelayMs, autosaveMaxWaitMs - waited)));
}

// Before leaving the open video (another video, New video, sign out), save its pending changes now
// instead of asking to discard them. Published videos still ask.
async function flushAutosave() {
  if (!state.isDirty || !autosaveEligible() || state.isSaving) return;
  clearTimeout(state.autosaveTimer);
  await autosave();
}

function cancelAutosave() {
  clearTimeout(state.autosaveTimer);
  state.autosaveTimer = null;
  state.dirtySince = null;
}

function mapVideoRow(row) {
  return {
    id: row.id,
    title: row.name,
    vimeoUrl: row.vimeo_url,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
    teamId: row.team_id ?? null,
    tags: (row.tags || []).map(cleanTag),
  };
}

// Saves quietly: it never redraws the moments, so typing and marking carry on undisturbed. Changes made
// while it saves stay unsaved and are picked up by the next autosave.
async function autosave() {
  state.autosaveTimer = null;
  if (!state.isDirty || !autosaveEligible()) return;
  if (state.isSaving || state.autosaving) {
    scheduleAutosave();
    return;
  }
  let payload;
  try {
    payload = videoPayload();
  } catch (error) {
    $("#saveHint").textContent = `Not saved yet: ${error.message}`;
    return;
  }
  const record = state.activeRecord;
  const change = state.changeCount;
  state.autosaving = true;
  $("#saveHint").textContent = "Saving…";
  try {
    const { data, error } = await supabase
      .from("videos")
      .upsert({
        id: payload.id,
        name: payload.title,
        vimeo_url: payload.vimeoUrl,
        status: "in_progress",
        tags: payload.tags,
        updated_at: new Date().toISOString(),
        published_at: null,
        ...(state.teamsAvailable ? { team_id: activeTeamId() } : {}),
      }, { onConflict: "id" })
      .select("*")
      .single();
    if (error) throw error;
    if (state.activeRecord !== record) return;
    const saved = mapVideoRow(data);
    state.activeRecord = saved;
    state.records = [saved, ...state.records.filter((item) => item.id !== saved.id)];
    renderLibrary();
    renderVideoHeader();
    if (state.changeCount === change) {
      state.isDirty = false;
      state.dirtySince = null;
      $("#saveHint").textContent = `Saved automatically at ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    } else {
      $("#saveHint").textContent = "Unsaved changes";
      scheduleAutosave();
    }
    state.autosaveFailed = false;
    refreshActions();
  } catch (error) {
    console.error("Autosave failed:", error);
    if (state.activeRecord !== record) return;
    $("#saveHint").textContent = "Autosave failed: retrying";
    if (!state.autosaveFailed) {
      notify(`Couldn't save automatically: ${friendlyError(error)} Touchline will keep trying, or press Save progress.`, "error");
    }
    state.autosaveFailed = true;
    clearTimeout(state.autosaveTimer);
    state.autosaveTimer = setTimeout(autosave, autosaveRetryMs);
  } finally {
    state.autosaving = false;
  }
}

function actionHint(incomplete, isPublished) {
  if (!state.activeRecord || !state.playerReady) return "";
  const parts = [];
  if (incomplete) {
    parts.push(incomplete === 1
      ? "1 moment without an event type is saved but hidden from viewers until it has one."
      : `${incomplete} moments without an event type are saved but hidden from viewers until they have one.`);
  }
  if (isPublished) parts.push(state.isDirty ? "Viewers see your changes after you re-publish. Published videos don't save automatically." : "No changes since this video was published.");
  else parts.push("Changes save automatically while the video is in progress.");
  return parts.join(" ");
}

// Accepts "75", "1:15" or "1:01:15" and returns seconds, or null when the text is not a time.
function parseTime(value) {
  const parts = value.trim().split(":");
  if (parts.length > 3 || parts.some((part) => !/^\d+$/.test(part))) return null;
  const numbers = parts.map(Number);
  if (numbers.slice(1).some((number) => number >= 60)) return null;
  return numbers.reduce((total, number) => total * 60 + number, 0);
}

function refreshActions() {
  const isAdmin = state.role === "admin";
  // A published record has no draft copy, so any save is visible to viewers; only offer the explicit re-publish action.
  const isPublished = state.activeRecord?.status === "published";
  const incomplete = state.tags.filter((tag) => !isComplete(tag)).length;
  const canSave = isAdmin && !!state.activeRecord && state.playerReady && !state.isSaving;
  $("#saveVideoButton").hidden = isPublished;
  // Add to queue saves the form as a new video, so it only makes sense when no video is open.
  $("#queueVideoButton").hidden = !!state.activeRecord;
  $("#unpublishVideoButton").hidden = !isPublished;
  $("#unpublishVideoButton").disabled = !canSave;
  $("#saveVideoButton").disabled = !canSave || !state.isDirty;
  $("#publishVideoButton").disabled = !canSave || (isPublished && !state.isDirty);
  $("#publishVideoButton").textContent = isPublished ? "Re-publish changes" : "Publish video";
  $("#markMomentButton").disabled = !isAdmin || !state.playerReady || state.isSaving;
  for (const selector of ["#rewindButton", "#playPauseButton", "#forwardButton", "#tagFullscreenButton"]) {
    $(selector).disabled = !state.playerReady;
  }
  $("#actionHint").textContent = actionHint(incomplete, isPublished);
  $("#tagCount").textContent = state.tags.length;
  // The line keeps its height when empty, so the Mark moment button below it never shifts under the pointer.
  $("#incompleteCount").textContent = incomplete ? `${incomplete} need${incomplete === 1 ? "s" : ""} a type` : "";
  document.querySelectorAll(".tag-time, .use-video-time, .quick-key").forEach((button) => { button.disabled = !state.playerReady; });
}

// "Not started" is not stored separately: an unpublished video with no moments yet is in the queue,
// and it moves to In progress as soon as it is saved with a moment.
function librarySection(record) {
  if (record.status === "published") return "published";
  return record.tags.some((tag) => !markerTypes.has(tag.eventType)) ? "in_progress" : "queued";
}

function startOfGameTag() {
  return {
    id: crypto.randomUUID(),
    timestampSeconds: defaultStartOfGameSeconds,
    eventType: "start_of_game",
    customEventType: "",
    playerIds: [],
    otherPlayers: "",
    playerNames: "",
    note: "",
    done: true,
  };
}

async function addToQueue() {
  if (state.role !== "admin" || state.activeRecord) return;
  const title = $("#videoName").value.trim();
  const vimeoUrl = $("#videoUrl").value.trim();
  if (!title) {
    notify("Enter a name for this video.", "error");
    $("#videoName").focus();
    return;
  }
  try {
    parseVimeoUrl(vimeoUrl);
  } catch (error) {
    notify(error.message, "error");
    $("#videoUrl").focus();
    return;
  }
  if (state.teamsAvailable && state.teams.length && !activeTeamId()) {
    notify("Choose the team for this video.", "error");
    $("#videoTeam").focus();
    return;
  }
  const existing = state.records.find((record) => record.vimeoUrl === vimeoUrl);
  if (existing && !window.confirm(`"${existing.title}" already uses this Vimeo link. Add it to the queue anyway?`)) return;

  const button = $("#queueVideoButton");
  button.disabled = true;
  try {
    const { error } = await supabase
      .from("videos")
      .insert({
        name: title,
        vimeo_url: vimeoUrl,
        status: "in_progress",
        tags: [serializeTag(startOfGameTag())],
        ...(state.teamsAvailable ? { team_id: activeTeamId() } : {}),
      });
    if (error) throw error;
    $("#videoName").value = "";
    $("#videoUrl").value = "";
    await loadLibrary();
    notify(`"${title}" is in your queue under Not started. Open it from the library when you're ready to tag it.`, "success");
    $("#videoName").focus();
  } catch (error) {
    notify(`Could not add "${title}" to the queue: ${friendlyError(error)}`, "error");
  } finally {
    button.disabled = false;
  }
}

function renderLibrary() {
  for (const [status, listSelector, countSelector, emptyMessage] of [
    ["queued", "#queueList", "#queueCount", "Nothing waiting. Use Add to queue to line up a video."],
    ["in_progress", "#inProgressList", "#inProgressCount", "No videos in progress."],
    ["published", "#publishedList", "#publishedCount", "No published videos yet."],
  ]) {
    const records = state.records.filter((record) => librarySection(record) === status);
    // The queue is first come, first served; the other lists show the most recently updated first.
    if (status === "queued") records.sort((first, second) => first.createdAt.localeCompare(second.createdAt));
    $(countSelector).textContent = records.length;
    const list = $(listSelector);
    if (!records.length) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = emptyMessage;
      list.replaceChildren(empty);
      continue;
    }
    list.replaceChildren(...records.map((record) => {
      const isActive = record.id === state.activeRecord?.id;
      const item = document.createElement("div");
      item.className = "saved-video-item";
      item.classList.toggle("active", isActive);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "saved-video";
      if (isActive) button.setAttribute("aria-current", "true");
      const title = document.createElement("strong");
      title.textContent = record.title;
      const incomplete = record.tags.filter((tag) => !isComplete(tag)).length;
      const details = document.createElement("span");
      const teamName = state.teams.find((team) => team.id === record.teamId)?.name || "";
      details.textContent = status === "queued"
        ? [teamName, `Added ${new Date(record.createdAt).toLocaleDateString()}`].filter(Boolean).join(" · ")
        : [
          teamName,
          plural(record.tags.filter((tag) => !markerTypes.has(tag.eventType)).length, "moment"),
          incomplete ? `${incomplete} need${incomplete === 1 ? "s" : ""} a type` : "",
          `Updated ${new Date(record.updatedAt).toLocaleDateString()}`,
        ].filter(Boolean).join(" · ");
      button.append(title, details);
      button.addEventListener("click", async () => {
        await flushAutosave();
        if (!confirmDiscard()) return;
        $("#videoName").value = record.title;
        $("#videoUrl").value = record.vimeoUrl;
        await openVideo(record.vimeoUrl, record);
      });

      if (state.role === "admin") {
        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "remove-video";
        removeButton.textContent = "Remove";
        removeButton.setAttribute("aria-label", `Remove ${record.title} from the library`);
        removeButton.addEventListener("click", () => removeVideo(record));
        const actions = document.createElement("div");
        actions.className = "saved-video-actions";
        if (record.status === "published") {
          const unpublishButton = document.createElement("button");
          unpublishButton.type = "button";
          unpublishButton.className = "remove-video";
          unpublishButton.textContent = "Unpublish";
          unpublishButton.setAttribute("aria-label", `Unpublish ${record.title}`);
          unpublishButton.addEventListener("click", () => unpublishRecord(record));
          actions.append(unpublishButton);
        }
        actions.append(removeButton);
        item.append(button, actions);
      } else {
        item.append(button);
      }
      return item;
    }));
  }
  renderPlayerSuggestions();
  renderWatchVideoOptions();
}

function renderPlayerSuggestions() {
  const names = new Set();
  for (const tag of [...state.records.flatMap((record) => record.tags), ...state.tags]) {
    for (const name of (tag.playerNames || "").split(",")) {
      const trimmed = name.trim();
      if (trimmed) names.add(trimmed);
    }
  }
  $("#playerNameOptions").replaceChildren(...[...names]
    .sort((first, second) => first.localeCompare(second))
    .map((name) => new Option(name)));
}

// Published videos as a list of cards, newest first, with a team filter once there is more than one team.
function renderWatchVideoList() {
  const teams = state.teams.filter((team) => state.records.some((record) => record.status === "published" && record.teamId === team.id));
  const filter = $("#watchTeamFilter");
  $("#watchTeamFilterLabel").hidden = teams.length < 2;
  if (!teams.some((team) => team.id === state.watchTeamFilter)) state.watchTeamFilter = "";
  filter.replaceChildren(new Option("All teams", ""), ...teams.map((team) => new Option(team.name, team.id)));
  filter.value = state.watchTeamFilter;

  const published = state.records
    .filter((record) => record.status === "published" && (!state.watchTeamFilter || record.teamId === state.watchTeamFilter))
    .sort((first, second) => (second.publishedAt || second.updatedAt || "").localeCompare(first.publishedAt || first.updatedAt || ""));
  const list = $("#watchVideoList");
  if (!published.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = state.records.some((record) => record.status === "published")
      ? "No published videos for this team."
      : "No published videos yet.";
    list.replaceChildren(empty);
    return;
  }
  list.replaceChildren(...published.map((record) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "watch-video-card";
    const selected = record.id === state.selectedWatchId;
    card.classList.toggle("active", selected);
    if (selected) card.setAttribute("aria-current", "true");
    const title = document.createElement("strong");
    title.textContent = record.title;
    const team = state.teams.find((item) => item.id === record.teamId)?.name;
    const moments = record.tags.filter((tag) => isComplete(tag) && !markerTypes.has(tag.eventType)).length;
    const when = record.publishedAt || record.updatedAt;
    const details = document.createElement("span");
    details.textContent = [team, when ? new Date(when).toLocaleDateString() : "", plural(moments, "moment")].filter(Boolean).join(" · ");
    card.append(title, details);
    card.addEventListener("click", () => {
      if (record.id !== state.selectedWatchId) selectWatchVideo(record.id);
    });
    return card;
  }));
}

function renderWatchVideoOptions() {
  const published = state.records.filter((record) => record.status === "published");
  const selectionExists = published.some((record) => record.id === state.selectedWatchId);
  const selectedId = selectionExists ? state.selectedWatchId : "";
  renderWatchVideoList();
  if (selectedId) {
    const selectedRecord = published.find((record) => record.id === selectedId);
    $("#watchVideoTitle").textContent = selectedRecord.title;
    renderWatchEvents(selectedRecord);
  }

  if (state.selectedWatchId && !selectionExists) {
    state.selectedWatchId = "";
    state.watchReady = false;
    stopPlaylist();
    state.watchLoadId++;
    if (state.watchPlayer) {
      state.watchPlayer.destroy().catch((error) => {
        console.error("Could not close the removed video's player:", error);
      });
      state.watchPlayer = null;
    }
    $("#watchVideoFrame").replaceChildren();
    $("#watchWorkspace").hidden = true;
    $("#watchEmpty").hidden = false;
    $("#watchWholeVideoButton").disabled = true;
  }
}

async function removeVideo(record) {
  if (state.activeRecord?.id === record.id && !confirmDiscard()) return;
  if (!window.confirm(`Remove "${record.title}" and its tags from the library? This cannot be undone.`)) return;

  try {
    const { data, error } = await supabase
      .from("videos")
      .delete()
      .eq("id", record.id)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Video was not found or you do not have permission to remove it.");
    state.records = state.records.filter((item) => item.id !== record.id);
    if (state.activeRecord?.id === record.id) {
      state.isDirty = false;
      await startNewVideo();
    }
    renderLibrary();
    notify(`"${record.title}" was removed from the library.`, "success");
  } catch (error) {
    notify(`Could not remove "${record.title}": ${friendlyError(error)}`, "error");
  }
}

async function unpublishRecord(record) {
  // The open video goes through the editor's own flow so its buttons and unsaved edits stay consistent.
  if (state.activeRecord?.id === record.id) {
    await saveVideo("unpublish");
    return;
  }
  if (!window.confirm(`Unpublish "${record.title}"? Viewers will no longer see it, and it moves back to In progress.`)) return;
  try {
    const { data, error } = await supabase
      .from("videos")
      .update({ status: "in_progress", published_at: null, updated_at: new Date().toISOString() })
      .eq("id", record.id)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Video was not found or you do not have permission to change it.");
    await loadLibrary();
    notify(`"${record.title}" is unpublished. Viewers can no longer see it.`, "success");
  } catch (error) {
    notify(`Could not unpublish "${record.title}": ${friendlyError(error)}`, "error");
  }
}

async function loadLibrary() {
  const { data, error } = await supabase
    .from("videos")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  state.records = data.map((record) => ({
    id: record.id,
    title: record.name,
    vimeoUrl: record.vimeo_url,
    status: record.status,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
    publishedAt: record.published_at,
    teamId: record.team_id ?? null,
    tags: (record.tags || []).map(cleanTag),
  }));
  await Promise.all([loadPlaylists(), loadTeams()]);
  renderTeamOptions();
  renderLibrary();
  renderTeams();
}

// Teams are optional: if database/004_teams.sql has not been run yet, videos simply have no team and
// players are typed as names.
async function loadTeams() {
  const [teams, members] = await Promise.all([
    supabase.from("teams").select("*").order("name"),
    supabase.from("team_members").select("*").order("created_at"),
  ]);
  if (teams.error || members.error) {
    console.warn("Teams are unavailable:", teams.error || members.error);
    state.teamsAvailable = false;
    state.teams = [];
    state.members = [];
    state.memberById = new Map();
    return;
  }
  state.teamsAvailable = true;
  state.teams = teams.data.map((team) => ({ id: team.id, name: team.name }));
  state.members = members.data.map(mapMember);
  state.memberById = new Map(state.members.map((member) => [member.id, member]));
}

function mapMember(row) {
  return {
    id: row.id,
    teamId: row.team_id,
    name: row.name,
    kind: row.kind,
    number: row.shirt_number,
    role: row.staff_role || "",
    active: row.active,
  };
}

// The Team choice in the video form. With one team it is chosen automatically.
function renderTeamOptions() {
  const select = $("#videoTeam");
  const show = state.teamsAvailable && state.teams.length > 0;
  $("#videoTeamField").hidden = !show;
  if (!show) return;
  const current = select.value || state.activeRecord?.teamId || "";
  select.replaceChildren(
    ...(state.teams.length > 1 ? [new Option("Choose a team…", "")] : []),
    ...state.teams.map((team) => new Option(team.name, team.id)),
  );
  select.value = state.teams.some((team) => team.id === current) ? current : (state.teams.length === 1 ? state.teams[0].id : "");
}

function notifyTeams(message, kind = "") {
  showNotice("#teamsNotice", message, kind);
}

// After a squad change, refresh everything that shows player names.
function refreshAfterTeamChange() {
  state.memberById = new Map(state.members.map((member) => [member.id, member]));
  renderTeamOptions();
  renderLibrary();
  renderTeams();
  if (state.activeRecord) renderTags();
}

function renderTeams() {
  if (state.role !== "admin") return;
  $("#teamsUnavailable").hidden = state.teamsAvailable;
  $("#teamsLayout").hidden = !state.teamsAvailable;
  if (!state.teamsAvailable) return;
  if (!state.teams.some((team) => team.id === state.selectedTeamId)) state.selectedTeamId = state.teams[0]?.id || "";

  $("#teamList").replaceChildren(...(state.teams.length ? state.teams.map((team) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "team-choice";
    button.classList.toggle("active", team.id === state.selectedTeamId);
    if (team.id === state.selectedTeamId) button.setAttribute("aria-current", "true");
    const name = document.createElement("strong");
    name.textContent = team.name;
    const count = document.createElement("span");
    const players = teamPlayers(team.id).length;
    const videos = state.records.filter((record) => record.teamId === team.id).length;
    count.textContent = `${plural(players, "player")} · ${plural(videos, "video")}`;
    button.append(name, count);
    button.addEventListener("click", () => {
      state.selectedTeamId = team.id;
      state.editingMemberId = "";
      renderTeams();
    });
    return button;
  }) : [Object.assign(document.createElement("p"), { className: "empty-state", textContent: "No teams yet. Add one below." })]));

  const team = state.teams.find((item) => item.id === state.selectedTeamId);
  $("#squadCard").hidden = !team;
  if (!team) return;
  if (document.activeElement !== $("#teamNameInput")) $("#teamNameInput").value = team.name;

  const members = state.members.filter((member) => member.teamId === team.id);
  const players = teamPlayers(team.id);
  const staff = members.filter((member) => member.kind === "staff" && member.active)
    .sort((first, second) => first.name.localeCompare(second.name));
  const removed = members.filter((member) => !member.active)
    .sort((first, second) => first.name.localeCompare(second.name));
  $("#squadPlayerCount").textContent = players.length;
  $("#squadStaffCount").textContent = staff.length;
  $("#removedCount").textContent = removed.length;
  $("#playerRows").replaceChildren(...players.map(memberRow));
  $("#staffRows").replaceChildren(...staff.map(memberRow));
  $("#removedRows").replaceChildren(...removed.map(memberRow));
  $("#removedMembers").hidden = removed.length === 0;
}

// One squad row: read-only with Edit and Remove/Restore, or an inline editor.
function memberRow(member) {
  const row = document.createElement("div");
  row.className = "member-row";
  const isPlayer = member.kind === "player";

  if (state.editingMemberId === member.id) {
    row.classList.add("editing");
    const number = document.createElement("input");
    number.type = "number";
    number.min = "0";
    number.max = "999";
    number.className = "member-number-input";
    number.value = member.number ?? "";
    number.setAttribute("aria-label", "Shirt number");
    const name = document.createElement("input");
    name.type = "text";
    name.maxLength = 120;
    name.value = member.name;
    name.setAttribute("aria-label", "Name");
    const role = document.createElement("input");
    role.type = "text";
    role.maxLength = 60;
    role.value = member.role;
    role.placeholder = "Role, e.g. Team Manager";
    role.setAttribute("aria-label", "Role");
    const save = document.createElement("button");
    save.type = "button";
    save.className = "tag-save-button";
    save.textContent = "Save";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "link-button";
    cancel.textContent = "Cancel";
    const submit = () => saveMember(member, {
      name: name.value.trim(),
      number: isPlayer ? number.value : null,
      role: isPlayer ? "" : role.value.trim(),
    });
    save.addEventListener("click", submit);
    for (const input of [number, name, role]) {
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          submit();
        } else if (event.key === "Escape") {
          state.editingMemberId = "";
          renderTeams();
        }
      });
    }
    cancel.addEventListener("click", () => {
      state.editingMemberId = "";
      renderTeams();
    });
    row.append(...(isPlayer ? [number, name] : [name, role]), save, cancel);
    queueMicrotask(() => name.focus());
    return row;
  }

  const label = document.createElement("span");
  label.className = "member-label";
  if (isPlayer) {
    const number = document.createElement("span");
    number.className = "member-number";
    number.textContent = member.number ?? "–";
    label.append(number, member.name);
  } else {
    label.append(member.name);
    if (member.role) {
      const role = document.createElement("span");
      role.className = "member-role";
      role.textContent = member.role;
      label.append(role);
    }
  }
  if (!member.active) {
    const kind = document.createElement("span");
    kind.className = "member-role";
    kind.textContent = isPlayer ? "former player" : "former staff";
    label.append(kind);
  }
  const edit = document.createElement("button");
  edit.type = "button";
  edit.className = "link-button";
  edit.textContent = "Edit";
  edit.setAttribute("aria-label", `Edit ${member.name}`);
  edit.addEventListener("click", () => {
    state.editingMemberId = member.id;
    renderTeams();
  });
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = member.active ? "delete-all" : "link-button";
  toggle.textContent = member.active ? "Remove" : "Restore";
  toggle.setAttribute("aria-label", `${member.active ? "Remove" : "Restore"} ${member.name}`);
  toggle.addEventListener("click", () => setMemberActive(member, !member.active));
  row.append(label, edit, toggle);
  return row;
}

function parseShirtNumber(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= 999 ? number : NaN;
}

// Warns (but allows) two active players with the same shirt number.
function confirmNumberClash(teamId, number, ignoreId = "") {
  if (number === null) return true;
  const clash = teamPlayers(teamId).find((member) => member.number === number && member.id !== ignoreId);
  return !clash || window.confirm(`#${number} is already ${clash.name}'s number. Use it anyway?`);
}

async function addTeam(event) {
  event.preventDefault();
  const name = $("#newTeamName").value.trim();
  if (!name) return;
  try {
    const { data, error } = await supabase.from("teams").insert({ name }).select("*").single();
    if (error) throw error;
    state.teams = [...state.teams, { id: data.id, name: data.name }].sort((first, second) => first.name.localeCompare(second.name));
    state.selectedTeamId = data.id;
    $("#newTeamName").value = "";
    refreshAfterTeamChange();
    notifyTeams(`Added the team "${data.name}". Now add its players.`, "success");
    $("#newPlayerName").focus();
  } catch (error) {
    notifyTeams(`Could not add the team: ${friendlyError(error)}`, "error");
  }
}

async function renameTeam(event) {
  event.preventDefault();
  const team = state.teams.find((item) => item.id === state.selectedTeamId);
  const name = $("#teamNameInput").value.trim();
  if (!team || !name || name === team.name) return;
  try {
    const { error } = await supabase.from("teams").update({ name }).eq("id", team.id);
    if (error) throw error;
    team.name = name;
    state.teams.sort((first, second) => first.name.localeCompare(second.name));
    refreshAfterTeamChange();
    notifyTeams(`Renamed the team to "${name}".`, "success");
  } catch (error) {
    notifyTeams(`Could not rename the team: ${friendlyError(error)}`, "error");
  }
}

// Deleting removes the team and its whole squad, so it is only allowed once no videos use the team.
async function deleteTeam() {
  const team = state.teams.find((item) => item.id === state.selectedTeamId);
  if (!team) return;
  const videos = state.records.filter((record) => record.teamId === team.id).length;
  if (videos) {
    notifyTeams(`"${team.name}" still has ${plural(videos, "video")}. Move each one to another team (the Team field when the video is open) or remove it, then delete the team.`, "error");
    return;
  }
  const members = state.members.filter((member) => member.teamId === team.id).length;
  if (!window.confirm(`Delete "${team.name}"${members ? ` and its squad of ${plural(members, "person")}` : ""}? This cannot be undone.`)) return;
  try {
    const { data, error } = await supabase
      .from("teams")
      .delete()
      .eq("id", team.id)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("The team was not deleted. If this keeps happening, re-run database/004_teams.sql in Supabase to allow deleting teams.");
    state.teams = state.teams.filter((item) => item.id !== team.id);
    state.members = state.members.filter((member) => member.teamId !== team.id);
    state.selectedTeamId = "";
    state.editingMemberId = "";
    refreshAfterTeamChange();
    notifyTeams(`Deleted the team "${team.name}".`, "success");
  } catch (error) {
    console.error("Team delete failed:", error);
    const hint = /permission|row-level security/i.test(error?.message || "")
      ? " Re-run database/004_teams.sql in the Supabase SQL Editor to allow deleting teams."
      : "";
    notifyTeams(`Could not delete "${team.name}": ${friendlyError(error)}${hint}`, "error");
  }
}

async function addMember(kind, event) {
  event.preventDefault();
  const teamId = state.selectedTeamId;
  const isPlayer = kind === "player";
  const name = (isPlayer ? $("#newPlayerName") : $("#newStaffName")).value.trim();
  if (!teamId || !name) return;
  const number = isPlayer ? parseShirtNumber($("#newPlayerNumber").value) : null;
  if (Number.isNaN(number)) {
    notifyTeams("Shirt numbers are whole numbers from 0 to 999.", "error");
    return;
  }
  if (isPlayer && !confirmNumberClash(teamId, number)) return;
  try {
    const { data, error } = await supabase
      .from("team_members")
      .insert({
        team_id: teamId,
        name,
        kind,
        shirt_number: number,
        staff_role: isPlayer ? "" : $("#newStaffRole").value.trim(),
      })
      .select("*")
      .single();
    if (error) throw error;
    state.members = [...state.members, mapMember(data)];
    for (const selector of isPlayer ? ["#newPlayerNumber", "#newPlayerName"] : ["#newStaffName", "#newStaffRole"]) $(selector).value = "";
    refreshAfterTeamChange();
    notifyTeams(`Added ${name}.`, "success");
    (isPlayer ? $("#newPlayerNumber") : $("#newStaffName")).focus();
  } catch (error) {
    notifyTeams(`Could not add ${name}: ${friendlyError(error)}`, "error");
  }
}

async function saveMember(member, changes) {
  if (!changes.name) {
    notifyTeams("A name is needed.", "error");
    return;
  }
  const number = member.kind === "player" ? parseShirtNumber(changes.number) : null;
  if (Number.isNaN(number)) {
    notifyTeams("Shirt numbers are whole numbers from 0 to 999.", "error");
    return;
  }
  if (member.kind === "player" && member.active && !confirmNumberClash(member.teamId, number, member.id)) return;
  try {
    const { data, error } = await supabase
      .from("team_members")
      .update({ name: changes.name, shirt_number: number, staff_role: changes.role })
      .eq("id", member.id)
      .select("*")
      .single();
    if (error) throw error;
    state.members = state.members.map((item) => item.id === member.id ? mapMember(data) : item);
    state.editingMemberId = "";
    refreshAfterTeamChange();
    notifyTeams(`Saved ${changes.name}.`, "success");
  } catch (error) {
    notifyTeams(`Could not save ${changes.name}: ${friendlyError(error)}`, "error");
  }
}

// Removing keeps the member (inactive) so old moments and stats still show them.
async function setMemberActive(member, active) {
  if (!active && !window.confirm(`Remove ${member.name} from the squad? They stay on old moments and in stats, but can't be picked for new ones.`)) return;
  try {
    const { data, error } = await supabase
      .from("team_members")
      .update({ active })
      .eq("id", member.id)
      .select("*")
      .single();
    if (error) throw error;
    state.members = state.members.map((item) => item.id === member.id ? mapMember(data) : item);
    refreshAfterTeamChange();
    notifyTeams(active ? `${member.name} is back in the squad.` : `Removed ${member.name}. Restore them from Removed if needed.`, "success");
  } catch (error) {
    notifyTeams(`Could not update ${member.name}: ${friendlyError(error)}`, "error");
  }
}

function tagEventLabel(tag) {
  if (tag.customEventType && tag.customEventType.trim()) {
    return tag.customEventType.trim();
  }
  if (tag.eventType === "other") {
    return "Other";
  }
  if (tag.eventType && typeof tag.eventType === "string") {
    const match = eventTypes.find(([value]) => value === tag.eventType);
    return match?.[1] || tag.eventType.replaceAll("_", " ");
  }
  return "Unclassified moment";
}

function watchEventTitle(tag) {
  const label = tagEventLabel(tag);
  const details = [tag.playerNames, tag.note].filter(Boolean).join(" · ");
  return details ? `${label} — ${details}` : label;
}

function currentWatchRecord() {
  return state.records.find((record) => record.id === state.selectedWatchId && record.status === "published");
}

// Published videos only show moments with an event type; older rows may still hold others.
function watchEvents(record) {
  return record.tags.filter(isComplete).sort(byTime);
}

function clipLengthSeconds() {
  const value = Number($("#clipLength").value);
  return clipLengthChoices.includes(value) ? value : 20;
}

function selectedWatchTags() {
  const record = currentWatchRecord();
  return record ? watchEvents(record).filter((tag) => state.watchSelectedIds.has(tag.id)) : [];
}

// "Tagged moments only": every event of the match back to back, skipping the dead time in between.
// Markers (Start of game, Half-time, End of game) are left out.
function taggedMoments(record) {
  return watchEvents(record).filter((tag) => !markerTypes.has(tag.eventType));
}

// How long a set of clips takes to watch: overlapping clips play straight through, so they count once.
function playlistSeconds(tags, length) {
  const spans = tags
    .map((tag) => {
      const start = Math.max(0, tag.timestampSeconds - watchLeadSeconds);
      return [start, start + length];
    })
    .sort((first, second) => first[0] - second[0]);
  let total = 0;
  let current = null;
  for (const [start, end] of spans) {
    if (current && start <= current[1]) {
      current[1] = Math.max(current[1], end);
    } else {
      if (current) total += current[1] - current[0];
      current = [start, end];
    }
  }
  if (current) total += current[1] - current[0];
  return total;
}

function refreshWatchControls() {
  const ready = state.watchReady;
  const selected = selectedWatchTags();
  const record = currentWatchRecord();
  const total = record ? watchEvents(record).length : 0;
  const moments = record ? taggedMoments(record) : [];
  const minutes = Math.max(1, Math.round(playlistSeconds(moments, clipLengthSeconds()) / 60));
  $("#watchMomentsButton").disabled = !ready || !moments.length;
  $("#watchMomentsButton").textContent = moments.length ? `▶ Tagged moments only (about ${minutes} min)` : "▶ Tagged moments only";
  $("#watchMomentsButton").title = moments.length
    ? `Plays all ${plural(moments.length, "moment")} back to back, ${clipLengthSeconds()} seconds each, skipping the rest of the match`
    : "This video has no tagged moments yet";
  $("#playSelectedButton").disabled = !ready || !selected.length;
  $("#playSelectedButton").textContent = selected.length ? `▶ Play selected (${plural(selected.length, "clip")})` : "▶ Play selected";
  $("#selectAllTypesButton").textContent = total && selected.length === total ? "Clear selection" : "Select all";
  $("#savePlaylistButton").hidden = state.role !== "admin";
  $("#savePlaylistButton").disabled = !selected.length || !state.playlistsAvailable;
  document.querySelectorAll(".watch-event, .watch-group-play, .stat-play").forEach((button) => { button.disabled = !ready; });
}

function renderWatchEvents(record) {
  const tags = watchEvents(record);
  const groups = new Map();
  for (const tag of tags) {
    const label = tagEventLabel(tag);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(tag);
  }
  const presentIds = new Set(tags.map((tag) => tag.id));
  for (const id of [...state.watchSelectedIds]) {
    if (!presentIds.has(id)) state.watchSelectedIds.delete(id);
  }
  const ordered = [...groups.entries()].sort(([firstLabel, [first]], [secondLabel, [second]]) =>
    groupOrder(first) - groupOrder(second) || firstLabel.localeCompare(secondLabel));

  $("#watchEventCount").textContent = tags.length;
  $("#watchNoEvents").hidden = tags.length > 0;
  $("#watchPlaylistControls").hidden = tags.length === 0;
  $("#watchGroups").replaceChildren(...ordered.map(([label, groupTags]) => {
    const expanded = state.watchExpandedTypes.has(label);
    const group = document.createElement("section");
    group.className = "watch-group";

    const header = document.createElement("div");
    header.className = "watch-group-header";
    const listId = `watch-group-${groupTags[0].id}`;

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "watch-group-toggle";
    toggle.textContent = expanded ? "▾" : "▸";
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.setAttribute("aria-controls", listId);
    toggle.setAttribute("aria-label", `${expanded ? "Hide" : "Show"} ${label} events`);

    const selectLabel = document.createElement("label");
    selectLabel.className = "watch-group-select";
    // The group box selects every event in the group; it shows "partly ticked" when only some are.
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.setAttribute("aria-label", `Select all ${label} events`);
    const name = document.createElement("span");
    name.textContent = label;
    const bubble = document.createElement("span");
    bubble.className = "count-bubble";
    selectLabel.append(checkbox, name, bubble);
    const eventBoxes = [];

    function syncGroup() {
      const selectedCount = groupTags.filter((tag) => state.watchSelectedIds.has(tag.id)).length;
      checkbox.checked = selectedCount === groupTags.length;
      checkbox.indeterminate = selectedCount > 0 && selectedCount < groupTags.length;
      bubble.textContent = selectedCount && selectedCount < groupTags.length ? `${selectedCount}/${groupTags.length}` : groupTags.length;
      for (const box of eventBoxes) box.checked = state.watchSelectedIds.has(box.dataset.tagId);
      refreshWatchControls();
    }

    checkbox.addEventListener("change", () => {
      for (const tag of groupTags) {
        if (checkbox.checked) state.watchSelectedIds.add(tag.id);
        else state.watchSelectedIds.delete(tag.id);
      }
      syncGroup();
    });

    const play = document.createElement("button");
    play.type = "button";
    play.className = "watch-group-play";
    play.textContent = "▶ Play";
    play.setAttribute("aria-label", `Play all ${plural(groupTags.length, "clip")} of ${label}`);
    play.addEventListener("click", () => startPlaylist(groupTags, label));

    header.append(toggle, selectLabel, play);

    const list = document.createElement("ol");
    list.className = "watch-event-list";
    list.id = listId;
    list.hidden = !expanded;
    list.append(...groupTags.map((tag) => {
      const item = document.createElement("li");
      item.className = "watch-event-item";
      const pick = document.createElement("input");
      pick.type = "checkbox";
      pick.className = "watch-event-pick";
      pick.dataset.tagId = tag.id;
      pick.setAttribute("aria-label", `Select ${tagEventLabel(tag)} at ${formatTime(tag.timestampSeconds)}`);
      pick.addEventListener("change", () => {
        if (pick.checked) state.watchSelectedIds.add(tag.id);
        else state.watchSelectedIds.delete(tag.id);
        syncGroup();
      });
      eventBoxes.push(pick);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "watch-event";
      button.dataset.tagId = tag.id;

      const time = document.createElement("span");
      time.className = "watch-event-time";
      time.textContent = formatTime(tag.timestampSeconds);
      const title = document.createElement("span");
      title.className = "watch-event-title";
      title.textContent = watchEventTitle(tag);

      button.append(time, title);
      button.addEventListener("click", () => playWatchMoment(tag.timestampSeconds));
      item.append(pick, button);
      return item;
    }));
    syncGroup();

    toggle.addEventListener("click", () => {
      const open = list.hidden;
      list.hidden = !open;
      toggle.textContent = open ? "▾" : "▸";
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", `${open ? "Hide" : "Show"} ${label} events`);
      if (open) state.watchExpandedTypes.add(label);
      else state.watchExpandedTypes.delete(label);
    });

    group.append(header, list);
    return group;
  }));
  renderSavedPlaylists(record);
  renderWatchStats(record);
  renderWatchTimeline(record);
  refreshWatchControls();
  renderPlaylistStatus();
}

function setWatchView(view) {
  state.watchView = view;
  $("#watchEventsView").hidden = view !== "events";
  $("#watchStatsView").hidden = view !== "stats";
  $("#watchViewEventsButton").setAttribute("aria-pressed", String(view === "events"));
  $("#watchViewStatsButton").setAttribute("aria-pressed", String(view === "stats"));
}

// A count that plays its clips back to back when clicked.
function statCount(tags, description) {
  if (!tags.length) {
    const zero = document.createElement("span");
    zero.className = "stat-zero";
    zero.textContent = "0";
    return zero;
  }
  const button = document.createElement("button");
  button.type = "button";
  button.className = "stat-play";
  button.textContent = tags.length;
  button.title = `Play these ${plural(tags.length, "clip")}`;
  button.setAttribute("aria-label", `${description}: ${tags.length}. Play these clips`);
  button.addEventListener("click", () => startPlaylist(tags, description));
  return button;
}

// Counts the video's events by type (split by half when Half-time is tagged) and by player.
// Markers (Start of game, Half-time, End of game) only set the boundaries and are never counted.
function renderWatchStats(record) {
  const container = $("#watchStatsView");
  const all = watchEvents(record);
  const halfTime = all.find((tag) => tag.eventType === "half_time")?.timestampSeconds ?? null;
  const counted = all.filter((tag) => !markerTypes.has(tag.eventType));
  if (!counted.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No events to count yet.";
    container.replaceChildren(empty);
    return;
  }
  const inHalf = (tags, half) => tags.filter((tag) => (tag.timestampSeconds < halfTime ? 1 : 2) === half);

  const byType = new Map();
  for (const tag of counted) {
    const label = tagEventLabel(tag);
    if (!byType.has(label)) byType.set(label, []);
    byType.get(label).push(tag);
  }
  const typeRows = [...byType.entries()].sort(([firstLabel, [first]], [secondLabel, [second]]) =>
    groupOrder(first) - groupOrder(second) || firstLabel.localeCompare(secondLabel));

  const eventsHeading = document.createElement("h3");
  eventsHeading.className = "stats-heading";
  eventsHeading.textContent = "Events";
  const hint = document.createElement("p");
  hint.className = "stats-hint";
  hint.textContent = halfTime === null
    ? "Totals for the whole video. Tag Half-time in the Tag view to split these by half. Click a number to play those clips."
    : `Split at Half-time (${formatTime(halfTime)}). Click a number to play those clips.`;

  const tableWrap = document.createElement("div");
  tableWrap.className = "stats-table-wrap";
  const table = document.createElement("table");
  table.className = "stats-table";
  const columns = halfTime === null ? ["Event", "Total"] : ["Event", "1st half", "2nd half", "Total"];
  const head = table.createTHead().insertRow();
  for (const name of columns) {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = name;
    head.append(cell);
  }
  const body = table.createTBody();
  const addRow = (label, tags, className = "") => {
    const row = body.insertRow();
    if (className) row.className = className;
    const name = document.createElement("th");
    name.scope = "row";
    name.textContent = label;
    row.append(name);
    if (halfTime !== null) {
      row.insertCell().append(statCount(inHalf(tags, 1), `${label}, 1st half`));
      row.insertCell().append(statCount(inHalf(tags, 2), `${label}, 2nd half`));
    }
    row.insertCell().append(statCount(tags, label));
  };
  for (const [label, tags] of typeRows) addRow(label, tags);
  addRow("All events", counted, "stats-total");
  tableWrap.append(table);

  // Players: squad members are counted by identity (so spelling and renames don't split them);
  // other names are matched ignoring case and extra spaces. A moment naming two players counts for both.
  const players = new Map();
  const unnamed = [];
  for (const tag of counted) {
    const { ids, others } = tagPlayers(tag, record.teamId);
    const people = [];
    for (const id of ids) {
      const member = state.memberById.get(id);
      if (member) people.push({ key: id, name: memberLabel(member) });
    }
    for (const name of others) people.push({ key: `other:${normalizeName(name)}`, name });
    // Without access to the squad, fall back to the names saved on the moment.
    if (!people.length && ids.length) {
      for (const name of splitNames(tag.playerNames)) people.push({ key: `other:${normalizeName(name)}`, name });
    }
    if (!people.length) unnamed.push(tag);
    for (const person of people) {
      if (!players.has(person.key)) players.set(person.key, { name: person.name, tags: [] });
      const entry = players.get(person.key);
      if (!entry.tags.includes(tag)) entry.tags.push(tag);
    }
  }
  const playerRows = [...players.values()].sort((first, second) =>
    second.tags.length - first.tags.length || first.name.localeCompare(second.name));
  if (unnamed.length) playerRows.push({ name: "No player named", tags: unnamed, unnamed: true });

  const playersHeading = document.createElement("h3");
  playersHeading.className = "stats-heading";
  playersHeading.textContent = "By player";
  const playerList = document.createElement("ul");
  playerList.className = "stats-players";
  playerList.append(...playerRows.map((player) => {
    const item = document.createElement("li");
    item.classList.toggle("stats-unnamed", !!player.unnamed);
    const top = document.createElement("div");
    top.className = "stats-player-top";
    const name = document.createElement("span");
    name.className = "stats-player-name";
    name.textContent = player.name;
    top.append(name, statCount(player.tags, player.name));
    const breakdown = new Map();
    for (const tag of player.tags) {
      const label = tagEventLabel(tag);
      breakdown.set(label, (breakdown.get(label) || 0) + 1);
    }
    const detail = document.createElement("span");
    detail.className = "stats-player-detail";
    detail.textContent = [...breakdown.entries()]
      .sort(([firstLabel, firstCount], [secondLabel, secondCount]) => secondCount - firstCount || firstLabel.localeCompare(secondLabel))
      .map(([label, count]) => `${label} ${count}`)
      .join(" · ");
    item.append(top, detail);
    return item;
  }));

  container.replaceChildren(eventsHeading, hint, tableWrap, playersHeading, playerList);
}

function mapPlaylist(row) {
  return {
    id: row.id,
    videoId: row.video_id,
    title: row.title,
    note: row.note || "",
    tagIds: Array.isArray(row.tag_ids) ? row.tag_ids : [],
    clipSeconds: row.clip_seconds,
    createdAt: row.created_at,
  };
}

// Playlists are optional: if database/003_playlists.sql has not been run yet, the rest of the app still works.
async function loadPlaylists() {
  const { data, error } = await supabase
    .from("playlists")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("Saved playlists are unavailable:", error);
    state.playlists = [];
    state.playlistsAvailable = false;
    return;
  }
  state.playlistsAvailable = true;
  state.playlists = data.map(mapPlaylist);
}

// A saved playlist's clips that still exist and have an event type, in match order.
function playlistTags(playlist, record) {
  const wanted = new Set(playlist.tagIds);
  return watchEvents(record).filter((tag) => wanted.has(tag.id));
}

function playlistLink(playlist) {
  return `${window.location.origin}${window.location.pathname}#playlist-${playlist.id}`;
}

async function copyPlaylistLink(playlist) {
  const url = playlistLink(playlist);
  try {
    await navigator.clipboard.writeText(url);
    notifyWatch(`Link to "${playlist.title}" copied. Anyone with a Touchline account can open it while the video is published.`, "success");
  } catch {
    window.prompt("Copy this link to share the playlist:", url);
  }
}

async function deleteSavedPlaylist(playlist) {
  if (!window.confirm(`Delete the playlist "${playlist.title}"? Links to it will stop working. The clips themselves are not affected.`)) return;
  try {
    const { data, error } = await supabase
      .from("playlists")
      .delete()
      .eq("id", playlist.id)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("The playlist was not found or you do not have permission to delete it.");
    state.playlists = state.playlists.filter((item) => item.id !== playlist.id);
    const record = currentWatchRecord();
    if (record) renderWatchEvents(record);
    notifyWatch(`Deleted the playlist "${playlist.title}".`, "success");
  } catch (error) {
    notifyWatch(`Could not delete "${playlist.title}": ${friendlyError(error)}`, "error");
  }
}

function renderSavedPlaylists(record) {
  const container = $("#savedPlaylists");
  const isAdmin = state.role === "admin";
  if (!state.playlistsAvailable) {
    container.hidden = !isAdmin;
    const message = document.createElement("p");
    message.className = "empty-state";
    message.textContent = "Saved playlists need a one-time database update: run database/003_playlists.sql in the Supabase SQL Editor.";
    container.replaceChildren(message);
    return;
  }
  const playlists = state.playlists.filter((playlist) => playlist.videoId === record.id);
  container.hidden = playlists.length === 0;
  if (!playlists.length) {
    container.replaceChildren();
    return;
  }
  container.replaceChildren(groupHeading("h3", "Playlists", playlists.length), ...playlists.map((playlist) => {
    const tags = playlistTags(playlist, record);
    const missing = playlist.tagIds.length - tags.length;
    const item = document.createElement("article");
    item.className = "saved-playlist";
    item.classList.toggle("linked", playlist.id === state.linkedPlaylistId);
    item.dataset.playlistId = playlist.id;

    const title = document.createElement("strong");
    title.className = "saved-playlist-title";
    title.textContent = playlist.title;
    const meta = document.createElement("span");
    meta.className = "saved-playlist-meta";
    meta.textContent = [
      plural(tags.length, "clip"),
      `${playlist.clipSeconds} seconds each`,
      missing > 0 ? `${missing} no longer available` : "",
    ].filter(Boolean).join(" · ");
    item.append(title, meta);

    if (playlist.note) {
      const note = document.createElement("p");
      note.className = "saved-playlist-note";
      note.textContent = playlist.note;
      item.append(note);
    }

    const actions = document.createElement("div");
    actions.className = "saved-playlist-actions";
    const play = document.createElement("button");
    play.type = "button";
    play.className = "watch-group-play";
    play.textContent = "▶ Play";
    play.disabled = !state.watchReady || !tags.length;
    play.setAttribute("aria-label", `Play the playlist ${playlist.title}`);
    play.addEventListener("click", () => startPlaylist(tags, playlist.title, { length: playlist.clipSeconds, note: playlist.note }));
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "link-button";
    copy.textContent = "Copy link";
    copy.addEventListener("click", () => copyPlaylistLink(playlist));
    actions.append(play, copy);
    if (isAdmin) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "delete-all";
      remove.textContent = "Delete";
      remove.setAttribute("aria-label", `Delete the playlist ${playlist.title}`);
      remove.addEventListener("click", () => deleteSavedPlaylist(playlist));
      actions.append(remove);
    }
    item.append(actions);
    return item;
  }));
}

function openPlaylistDialog() {
  const record = currentWatchRecord();
  const tags = selectedWatchTags();
  if (!record || !tags.length) return;
  $("#playlistForm").reset();
  $("#playlistDialogNotice").textContent = "";
  $("#playlistDialogSummary").textContent = `${plural(tags.length, "clip")} from ${record.title}, ${clipLengthSeconds()} seconds each.`;
  $("#playlistDialog").showModal();
  $("#playlistTitle").focus();
}

async function savePlaylist(event) {
  event.preventDefault();
  const record = currentWatchRecord();
  const tags = selectedWatchTags();
  const title = $("#playlistTitle").value.trim();
  if (!record || !tags.length) return;
  if (!title) {
    $("#playlistDialogNotice").textContent = "Give the playlist a title.";
    return;
  }
  const button = $("#savePlaylistSubmit");
  button.disabled = true;
  try {
    const { data, error } = await supabase
      .from("playlists")
      .insert({
        video_id: record.id,
        title,
        note: $("#playlistNote").value.trim(),
        tag_ids: tags.map((tag) => tag.id),
        clip_seconds: clipLengthSeconds(),
      })
      .select("*")
      .single();
    if (error) throw error;
    const playlist = mapPlaylist(data);
    state.playlists = [playlist, ...state.playlists];
    $("#playlistDialog").close();
    renderWatchEvents(record);
    showNotice("#watchNotice", `Saved the playlist "${playlist.title}".`, "success", {
      label: "Copy link",
      onClick: () => copyPlaylistLink(playlist),
    });
  } catch (error) {
    $("#playlistDialogNotice").textContent = `Could not save the playlist. ${friendlyError(error)}`;
  } finally {
    button.disabled = false;
  }
}

// Opens the playlist named in the address (#playlist-<id>), e.g. from a shared link.
async function openLinkedPlaylist() {
  const match = window.location.hash.match(/^#playlist-([0-9a-f-]{36})$/i);
  if (!match || !state.role) return;
  const id = match[1].toLowerCase();
  const playlist = state.playlists.find((item) => item.id === id);
  const record = playlist && state.records.find((item) => item.id === playlist.videoId && item.status === "published");
  setTab("watch");
  if (!playlist || !record) {
    notifyWatch("This playlist link doesn't work any more: the playlist was deleted, or its video isn't published.", "error");
    return;
  }
  state.linkedPlaylistId = id;
  setWatchView("events");
  await selectWatchVideo(record.id);
  if (state.selectedWatchId !== record.id) return;
  renderWatchEvents(record);
  document.querySelector(`[data-playlist-id="${id}"]`)?.scrollIntoView({ block: "nearest" });
  notifyWatch(`Playlist from your coach: "${playlist.title}". Press ▶ Play on it to watch.`, "success");
}

// A playlist plays several clips back to back. Each clip starts a little before its moment and runs
// for the chosen clip length; overlapping clips run on without jumping back.
function startPlaylist(tags, description, options = {}) {
  if (!state.watchPlayer || !state.watchReady || !tags.length) return;
  const length = options.length ?? clipLengthSeconds();
  state.playlist = {
    description,
    note: options.note || "",
    clips: tags.map((tag) => {
      const start = Math.max(0, tag.timestampSeconds - watchLeadSeconds);
      return { tag, start, end: start + length };
    }),
    index: 0,
    seeking: false,
  };
  notifyWatch(`Playing ${plural(tags.length, "clip")} of ${description}, ${length} seconds each.`, "success");
  playClip(0);
}

function playClip(index) {
  const playlist = state.playlist;
  if (!playlist || !state.watchPlayer) return;
  if (index >= playlist.clips.length) {
    finishPlaylist();
    return;
  }
  playlist.index = Math.max(0, index);
  const clip = playlist.clips[playlist.index];
  playlist.seeking = true;
  renderPlaylistStatus();
  state.watchPlayer.setCurrentTime(clip.start)
    .then(() => {
      if (state.playlist !== playlist) return;
      playlist.seeking = false;
      return state.watchPlayer.play();
    })
    .catch((error) => {
      if (state.playlist !== playlist) return;
      stopPlaylist();
      notifyWatch(`Could not play the clip at ${formatTime(clip.tag.timestampSeconds)}: ${error.message}`, "error");
    });
}

function advancePlaylist(currentSeconds) {
  const playlist = state.playlist;
  const next = playlist.index + 1;
  if (next >= playlist.clips.length) {
    finishPlaylist();
    return;
  }
  const clip = playlist.clips[next];
  if (clip.start <= currentSeconds && currentSeconds < clip.end) {
    playlist.index = next;
    renderPlaylistStatus();
    return;
  }
  playClip(next);
}

function stopPlaylist() {
  state.playlist = null;
  renderPlaylistStatus();
}

function finishPlaylist() {
  const total = state.playlist?.clips.length || 0;
  state.watchPlayer?.pause().catch(() => {});
  stopPlaylist();
  notifyWatch(`Finished all ${plural(total, "clip")}.`, "success");
}

function renderPlaylistStatus() {
  const playlist = state.playlist;
  $("#playlistBar").hidden = !playlist;
  const currentId = playlist?.clips[playlist.index]?.tag.id;
  document.querySelectorAll(".watch-event, #watchTimelineBar .timeline-tick").forEach((button) => {
    button.classList.toggle("playing", !!currentId && button.dataset.tagId === currentId);
  });
  document.body.classList.toggle("playlist-playing", !!playlist);
  if (!playlist) return;
  $("#playlistNoteText").textContent = playlist.note;
  $("#playlistNoteText").hidden = !playlist.note;
  const { tag } = playlist.clips[playlist.index];
  const who = tag.playerNames ? ` · ${tag.playerNames}` : "";
  $("#playlistStatus").textContent = `${playlist.description}: clip ${playlist.index + 1} of ${playlist.clips.length} · ${tagEventLabel(tag)} at ${formatTime(tag.timestampSeconds)}${who}`;
  $("#playlistPrevButton").disabled = playlist.index === 0;
  $("#playlistNextButton").textContent = playlist.index === playlist.clips.length - 1 ? "Finish" : "Next ▶";
}

function playWatchMoment(timestampSeconds) {
  if (!state.watchPlayer) return;
  stopPlaylist();
  const start = Math.max(0, timestampSeconds - watchLeadSeconds);
  state.watchPlayer.setCurrentTime(start).catch((error) => {
    notifyWatch(`Could not seek to ${formatTime(timestampSeconds)}: ${error.message}`, "error");
  });
  state.watchPlayer.play().catch((error) => {
    notifyWatch(`Jumped to ${formatTime(start)}, but could not start playback: ${error.message}`, "error");
  });
  notifyWatch(start < timestampSeconds
    ? `Playing from ${formatTime(start)}, ${timestampSeconds - start < watchLeadSeconds ? "the start of the video" : `${watchLeadSeconds} seconds before the moment`}.`
    : `Playing from ${formatTime(start)}.`, "success");
}

async function selectWatchVideo(recordId) {
  const record = state.records.find((item) => item.id === recordId && item.status === "published");
  state.selectedWatchId = record?.id || "";
  renderWatchVideoList();
  state.watchSelectedIds.clear();
  state.watchExpandedTypes.clear();
  if (state.linkedPlaylistId) {
    const linked = state.playlists.find((item) => item.id === state.linkedPlaylistId);
    if (linked?.videoId !== state.selectedWatchId) state.linkedPlaylistId = "";
  }
  state.watchReady = false;
  state.watchDuration = 0;
  stopPlaylist();
  const loadId = ++state.watchLoadId;

  if (state.watchPlayer) {
    try {
      await state.watchPlayer.destroy();
    } catch (error) {
      console.error("Could not close the previous watch player:", error);
    }
    state.watchPlayer = null;
  }

  $("#watchVideoFrame").replaceChildren();
  $("#watchWholeVideoButton").disabled = true;
  $("#watchFullscreenButton").disabled = true;
  if (!record) {
    exitStage();
    $("#watchWorkspace").hidden = true;
    $("#watchEmpty").hidden = false;
    return;
  }

  $("#watchEmpty").hidden = true;
  $("#watchWorkspace").hidden = false;
  $("#watchVideoTitle").textContent = record.title;
  renderWatchEvents(record);
  notifyWatch("Loading video…");

  let video;
  try {
    video = parseVimeoUrl(record.vimeoUrl);
  } catch (error) {
    notifyWatch(`Could not open the saved Vimeo link: ${error.message}`, "error");
    return;
  }

  const frame = document.createElement("iframe");
  frame.title = `${record.title} Vimeo video`;
  frame.allow = "autoplay; fullscreen; picture-in-picture; encrypted-media";
  const embedUrl = new URL(`https://player.vimeo.com/video/${video.id}`);
  if (video.hash) embedUrl.searchParams.set("h", video.hash);
  frame.src = embedUrl.href;
  $("#watchVideoFrame").append(frame);
  watchZoom.reset();

  try {
    await loadVimeoSdk();
    if (loadId !== state.watchLoadId) return;
    const player = new window.Vimeo.Player(frame);
    state.watchPlayer = player;
    player.on("error", (error) => {
      if (loadId === state.watchLoadId) notifyWatch(`Vimeo player error: ${error.message || "The video could not be played."}`, "error");
    });
    player.on("timeupdate", ({ seconds }) => {
      if (loadId === state.watchLoadId && state.watchDuration) {
        $("#watchTimelineNow").style.left = `${Math.min(100, Math.max(0, (seconds / state.watchDuration) * 100))}%`;
      }
      const playlist = state.playlist;
      if (loadId !== state.watchLoadId || !playlist || playlist.seeking) return;
      // Only react just past the clip's end: a time far beyond it is a stale update from before a seek
      // (e.g. after Previous), and real jumps elsewhere are handled by "seeked".
      const { end } = playlist.clips[playlist.index];
      if (seconds >= end && seconds < end + 3) advancePlaylist(seconds);
    });
    player.on("ended", () => {
      if (loadId === state.watchLoadId && state.playlist && !state.playlist.seeking) advancePlaylist(Infinity);
    });
    // Moving the video by hand (outside the current clip) ends the playlist instead of fighting the viewer.
    player.on("seeked", ({ seconds }) => {
      const playlist = state.playlist;
      if (loadId !== state.watchLoadId || !playlist || playlist.seeking) return;
      const clip = playlist.clips[playlist.index];
      if (seconds < clip.start - 1 || seconds > clip.end + 1) {
        stopPlaylist();
        notifyWatch("Stopped the clips because the video moved to another point.", "success");
      }
    });
    await player.ready();
    if (loadId !== state.watchLoadId) {
      await player.destroy();
      return;
    }
    state.watchReady = true;
    state.watchDuration = await player.getDuration().catch(() => 0);
    if (loadId !== state.watchLoadId) return;
    renderWatchTimeline(record);
    $("#watchWholeVideoButton").disabled = false;
    $("#watchFullscreenButton").disabled = false;
    refreshWatchControls();
    notifyWatch(`${record.title} is ready. Tick event types to play their clips back to back, or watch the whole video.`, "success");
  } catch (error) {
    if (loadId === state.watchLoadId) {
      state.watchPlayer = null;
      notifyWatch(`Could not open this Vimeo video: ${error.message}`, "error");
    }
  }
}

function updateTag(id, changes) {
  state.tags = state.tags.map((tag) => tag.id === id ? { ...tag, ...changes } : tag);
  setDirty();
}

function deleteMoment(id) {
  const removed = state.tags.find((tag) => tag.id === id);
  if (!removed) return;
  state.tags = state.tags.filter((tag) => tag.id !== id);
  setDirty();
  renderTags();
  notify(`Deleted the ${isComplete(removed) ? tagEventLabel(removed) : "moment"} at ${formatTime(removed.timestampSeconds)}.`, "success", {
    label: "Undo",
    onClick: () => {
      if (state.tags.some((tag) => tag.id === removed.id)) return;
      state.tags = [...state.tags, removed].sort(byTime);
      setDirty();
      renderTags();
      notify(`Restored the moment at ${formatTime(removed.timestampSeconds)}.`, "success");
    },
  });
}

function markDone(id) {
  const tag = state.tags.find((item) => item.id === id);
  if (!tag) return;
  if (!isComplete(tag)) {
    notify("Choose an event type before marking this moment as done.", "error");
    return;
  }
  updateTag(id, { done: true });
  if (state.expandedTagId === id) state.expandedTagId = "";
  renderTags();
  goToNextTodo(tag);
  notify(`Done: ${tagEventLabel(tag)} at ${formatTime(tag.timestampSeconds)}.`, "success", {
    label: "Undo",
    onClick: () => {
      updateTag(id, { done: false });
      renderTags();
      notify(`Moved the moment at ${formatTime(tag.timestampSeconds)} back to To do.`, "success");
    },
  });
}

function renderTagRow(tag, done) {
  const time = formatTime(tag.timestampSeconds);
  const row = document.createElement("li");
  row.className = "tag-row";
  row.classList.toggle("done", done);
  row.dataset.tagId = tag.id;

  const seekButton = document.createElement("button");
  seekButton.className = "tag-time";
  seekButton.type = "button";
  seekButton.textContent = time;
  seekButton.disabled = !state.playerReady;
  seekButton.setAttribute("aria-label", `Play from ${time}`);
  seekButton.addEventListener("click", () => {
    state.player?.setCurrentTime(tag.timestampSeconds).catch((error) => {
      notify(`Could not seek to this moment: ${error.message}`, "error");
    });
  });

  const editTimeButton = document.createElement("button");
  editTimeButton.className = "edit-time";
  editTimeButton.type = "button";
  editTimeButton.textContent = "Edit";
  editTimeButton.setAttribute("aria-label", `Edit the time of the moment at ${time}`);
  editTimeButton.setAttribute("aria-expanded", "false");

  const timeColumn = document.createElement("div");
  timeColumn.className = "tag-time-col";
  timeColumn.append(seekButton, editTimeButton);
  let pick = null;
  if (!done) {
    pick = document.createElement("input");
    pick.type = "checkbox";
    pick.className = "bulk-pick";
    pick.checked = state.bulkIds.has(tag.id);
    pick.setAttribute("aria-label", `Select the moment at ${time} to edit several at once`);
    pick.addEventListener("change", () => {
      if (pick.checked) state.bulkIds.add(tag.id);
      else state.bulkIds.delete(tag.id);
      renderTags();
      document.querySelector(`[data-tag-id="${tag.id}"] .bulk-pick`)?.focus();
    });
  }

  const details = document.createElement("div");
  details.className = "tag-details";

  const timeEditor = document.createElement("div");
  timeEditor.className = "time-editor";
  timeEditor.hidden = true;
  const timeInput = document.createElement("input");
  timeInput.className = "time-input";
  timeInput.type = "text";
  timeInput.inputMode = "numeric";
  timeInput.value = time;
  timeInput.setAttribute("aria-label", `New time for the moment at ${time}, as minutes:seconds`);
  const setTimeButton = document.createElement("button");
  setTimeButton.type = "button";
  setTimeButton.className = "tag-save-button";
  setTimeButton.textContent = "Set time";
  const currentTimeButton = document.createElement("button");
  currentTimeButton.type = "button";
  currentTimeButton.className = "tag-save-button use-video-time";
  currentTimeButton.textContent = "Use video time";
  currentTimeButton.disabled = !state.playerReady;
  const cancelTimeButton = document.createElement("button");
  cancelTimeButton.type = "button";
  cancelTimeButton.className = "link-button";
  cancelTimeButton.textContent = "Cancel";
  timeEditor.append(timeInput, setTimeButton, currentTimeButton, cancelTimeButton);

  function showTimeEditor(open) {
    timeEditor.hidden = !open;
    editTimeButton.setAttribute("aria-expanded", String(open));
    if (open) {
      const current = state.tags.find((item) => item.id === tag.id);
      timeInput.value = formatTime(current?.timestampSeconds ?? tag.timestampSeconds);
      timeInput.focus();
      timeInput.select();
    }
  }

  function moveMoment(seconds) {
    if (state.videoDuration && seconds > state.videoDuration) {
      notify(`That is after the end of the video (${formatTime(state.videoDuration)}).`, "error");
      return;
    }
    updateTag(tag.id, { timestampSeconds: seconds });
    state.tags = [...state.tags].sort(byTime);
    renderTags();
    document.querySelector(`[data-tag-id="${tag.id}"]`)?.classList.add("just-added");
    state.player?.setCurrentTime(seconds).catch(() => {});
    notify(`Moved the moment from ${time} to ${formatTime(seconds)}.`, "success");
  }

  function applyTypedTime() {
    const seconds = parseTime(timeInput.value);
    if (seconds === null) {
      notify("Type the time as minutes:seconds, for example 12:45, or hours:minutes:seconds.", "error");
      timeInput.focus();
      return;
    }
    moveMoment(seconds);
  }

  editTimeButton.addEventListener("click", () => showTimeEditor(timeEditor.hidden));
  setTimeButton.addEventListener("click", applyTypedTime);
  cancelTimeButton.addEventListener("click", () => {
    showTimeEditor(false);
    editTimeButton.focus();
  });
  currentTimeButton.addEventListener("click", () => {
    if (!state.player) return;
    state.player.getCurrentTime()
      .then(moveMoment)
      .catch((error) => notify(`Could not read the video time: ${error.message}`, "error"));
  });
  timeInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      applyTypedTime();
    } else if (event.key === "Escape") {
      event.preventDefault();
      showTimeEditor(false);
      editTimeButton.focus();
    }
  });

  const status = document.createElement("p");
  status.className = "tag-status";

  const quickTypes = document.createElement("div");
  quickTypes.className = "quick-types";
  quickTypes.setAttribute("role", "group");
  quickTypes.setAttribute("aria-label", `Quick event types for ${time}`);
  for (const value of state.quickTypes) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "quick-type";
    chip.textContent = eventTypes.find(([type]) => type === value)[1];
    chip.addEventListener("click", () => {
      eventType.value = value;
      applyEventType(value);
      (addPlayer.hidden ? playerNames : addPlayer).focus();
    });
    quickTypes.append(chip);
  }

  const eventType = document.createElement("select");
  eventType.className = "event-type";
  eventType.setAttribute("aria-label", `Event type at ${time}`);
  for (const [value, text] of eventTypes) eventType.add(new Option(text, value));
  eventType.value = tag.eventType || "";
  eventType.addEventListener("change", () => {
    applyEventType(eventType.value);
    if (eventType.value === "other") customEvent.focus();
  });

  const customWrap = document.createElement("div");
  customWrap.className = "custom-event-wrap";

  const customEvent = document.createElement("input");
  customEvent.className = "custom-event";
  customEvent.type = "text";
  customEvent.maxLength = 80;
  customEvent.value = tag.customEventType || "";
  customEvent.placeholder = "Name this event";
  customEvent.setAttribute("aria-label", `Custom event name at ${time}`);
  customEvent.addEventListener("input", () => {
    updateTag(tag.id, { customEventType: customEvent.value });
    refreshRow();
  });
  customWrap.append(customEvent);

  // Players: pick from the video's squad (chips), plus "Other name…" for opponents or guests.
  const picker = document.createElement("div");
  picker.className = "player-picker";
  const chips = document.createElement("div");
  chips.className = "player-chips";
  const addPlayer = document.createElement("select");
  addPlayer.className = "player-add";
  addPlayer.setAttribute("aria-label", `Add a player at ${time}`);
  const playerNames = document.createElement("input");
  playerNames.className = "player-names";
  playerNames.type = "text";
  playerNames.maxLength = 200;
  playerNames.setAttribute("list", "playerNameOptions");
  playerNames.setAttribute("aria-label", `Other player names at ${time}`);
  picker.append(chips, addPlayer, playerNames);
  let showOther = false;

  function currentTag() {
    return state.tags.find((item) => item.id === tag.id) || tag;
  }

  function renderPicker() {
    const current = currentTag();
    const ids = current.playerIds || [];
    const squad = teamPlayers(activeTeamId());
    chips.replaceChildren(...ids.map((id) => {
      const member = state.memberById.get(id);
      const chip = document.createElement("span");
      chip.className = "player-chip";
      chip.textContent = member ? `${memberLabel(member)}${member.active ? "" : " (former)"}` : "Unknown player";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "player-chip-remove";
      remove.textContent = "×";
      remove.setAttribute("aria-label", `Remove ${member?.name || "player"} from this moment`);
      remove.addEventListener("click", () => {
        updateTag(tag.id, { playerIds: (currentTag().playerIds || []).filter((item) => item !== id) });
        renderPicker();
        refreshRow();
        addPlayer.focus();
      });
      chip.append(remove);
      return chip;
    }));
    chips.hidden = ids.length === 0;
    addPlayer.replaceChildren(
      new Option(squad.length ? "Add player…" : "Add a name…", ""),
      ...squad.filter((member) => !ids.includes(member.id))
        .map((member) => new Option(member.number === null ? member.name : `${member.number} · ${member.name}`, member.id)),
      new Option("Other name…", "__other"),
    );
    addPlayer.value = "";
    addPlayer.hidden = squad.length === 0;
    const others = current.otherPlayers || "";
    if (document.activeElement !== playerNames) playerNames.value = others;
    playerNames.placeholder = squad.length ? "Other names (opponents, guests), comma separated" : "Player name(s), comma separated";
    playerNames.hidden = squad.length > 0 && !others && !showOther;
  }

  addPlayer.addEventListener("change", () => {
    if (addPlayer.value === "__other") {
      showOther = true;
      renderPicker();
      playerNames.focus();
      return;
    }
    if (addPlayer.value) updateTag(tag.id, { playerIds: [...(currentTag().playerIds || []), addPlayer.value] });
    renderPicker();
    refreshRow();
    addPlayer.focus();
  });
  playerNames.addEventListener("input", () => updateTag(tag.id, { otherPlayers: playerNames.value }));
  // A typed name that matches the squad becomes that player when the field is left.
  playerNames.addEventListener("change", () => {
    const squad = teamPlayers(activeTeamId());
    const ids = [...(currentTag().playerIds || [])];
    const others = [];
    for (const name of splitNames(playerNames.value)) {
      const match = squad.find((member) => normalizeName(member.name) === normalizeName(name));
      if (!match) others.push(name);
      else if (!ids.includes(match.id)) ids.push(match.id);
    }
    if (others.join(", ") !== splitNames(playerNames.value).join(", ")) {
      updateTag(tag.id, { playerIds: ids, otherPlayers: others.join(", ") });
      playerNames.value = others.join(", ");
      renderPicker();
    }
    refreshRow();
  });
  renderPicker();

  const note = document.createElement("input");
  note.className = "moment-note";
  note.type = "text";
  note.maxLength = 500;
  note.value = tag.note || "";
  note.placeholder = "Optional note";
  note.setAttribute("aria-label", `Optional note at ${time}`);
  note.addEventListener("input", () => updateTag(tag.id, { note: note.value }));

  const deleteButton = document.createElement("button");
  deleteButton.className = "delete-tag";
  deleteButton.type = "button";
  deleteButton.textContent = "×";
  deleteButton.setAttribute("aria-label", `Delete moment at ${time}`);
  deleteButton.addEventListener("click", () => deleteMoment(tag.id));

  const rowActions = document.createElement("div");
  rowActions.className = "row-actions";
  const doneButton = document.createElement("button");
  doneButton.type = "button";
  if (done) {
    doneButton.className = "link-button";
    doneButton.textContent = "Move back to To do";
    doneButton.addEventListener("click", () => {
      updateTag(tag.id, { done: false });
      renderTags();
      notify(`Moved the moment at ${time} back to To do.`, "success");
    });
  } else {
    doneButton.className = "done-button";
    doneButton.textContent = "✓ Done";
    doneButton.setAttribute("aria-label", `Mark the moment at ${time} as done`);
    doneButton.addEventListener("click", () => markDone(tag.id));
  }
  rowActions.append(doneButton);

  // Enter in a to-do row's text fields ticks the moment off, so typing names never needs the mouse.
  if (!done) {
    for (const input of [customEvent, playerNames, note]) {
      input.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
        event.preventDefault();
        // Link any typed squad names before the row moves to Done.
        if (input === playerNames) playerNames.dispatchEvent(new Event("change"));
        markDone(tag.id);
      });
    }
  }

  function applyEventType(value) {
    if (value === "other") {
      updateTag(tag.id, { eventType: value });
    } else {
      customEvent.value = "";
      updateTag(tag.id, { eventType: value, customEventType: "" });
    }
    // A done moment moves to its new type's group, or back to To do once it no longer has a full type.
    if (done) {
      const current = state.tags.find((item) => item.id === tag.id);
      if (!isComplete(current)) updateTag(tag.id, { done: false });
      // Open the group the edited moment moves into, so it doesn't vanish from view mid-edit.
      else state.expandedGroups.add(tagEventLabel(current));
      renderTags();
      if (value === "other") document.querySelector(`[data-tag-id="${tag.id}"] .custom-event`)?.focus();
      return;
    }
    refreshRow();
  }

  // The one-line summary: always visible. Its main part opens and closes the editor below it.
  const expanded = state.expandedTagId === tag.id;
  const summary = document.createElement("div");
  summary.className = "tag-summary";
  const pickSlot = document.createElement("span");
  pickSlot.className = "tag-summary-pick";
  if (pick) pickSlot.append(pick);
  const summaryTime = document.createElement("button");
  summaryTime.type = "button";
  summaryTime.className = "tag-time tag-summary-time";
  summaryTime.textContent = time;
  summaryTime.disabled = !state.playerReady;
  summaryTime.setAttribute("aria-label", `Play from ${time}`);
  summaryTime.addEventListener("click", () => {
    state.player?.setCurrentTime(tag.timestampSeconds).catch((error) => {
      notify(`Could not seek to this moment: ${error.message}`, "error");
    });
  });
  const summaryMain = document.createElement("button");
  summaryMain.type = "button";
  summaryMain.className = "tag-summary-main";
  summaryMain.setAttribute("aria-expanded", String(expanded));
  const summaryLabel = document.createElement("span");
  summaryLabel.className = "tag-summary-label";
  const summaryPlayers = document.createElement("span");
  summaryPlayers.className = "tag-summary-players";
  const summaryMark = document.createElement("span");
  summaryMark.className = "tag-summary-mark";
  summaryMark.setAttribute("aria-hidden", "true");
  summaryMain.append(summaryLabel, summaryPlayers, summaryMark);
  summaryMain.addEventListener("click", () => toggleTagEditor(tag.id));
  summary.append(pickSlot, summaryTime, summaryMain);

  const editor = document.createElement("div");
  editor.className = "tag-editor";
  editor.hidden = !expanded;
  row.classList.toggle("expanded", expanded);
  row.classList.toggle("just-marked", tag.id === state.lastMarkedId);

  function refreshRow() {
    const current = state.tags.find((item) => item.id === tag.id);
    if (!current) return;
    const complete = isComplete(current);
    row.classList.toggle("incomplete", !complete);
    status.hidden = complete;
    status.textContent = current.eventType === "other" ? "Name this event" : "Needs an event type";
    quickTypes.hidden = !!current.eventType;
    customWrap.hidden = current.eventType !== "other";
    if (!done) doneButton.disabled = !complete;
    summaryLabel.textContent = complete ? tagEventLabel(current) : "Needs a type";
    const { ids, others } = tagPlayers(current, activeTeamId());
    const names = [...ids.map((id) => state.memberById.get(id)).filter(Boolean).map(memberLabel), ...others];
    summaryPlayers.textContent = names.length ? names.join(", ") : "";
    summaryPlayers.hidden = !names.length;
    summaryMark.textContent = isDone(current) ? "✓" : (expanded ? "▾" : "▸");
    summaryMain.setAttribute("aria-label", `${time} ${summaryLabel.textContent}${names.length ? `, ${names.join(", ")}` : ""}. ${expanded ? "Close" : "Edit"} this moment`);
  }

  details.append(timeEditor, status, quickTypes, eventType, customWrap, picker, note, rowActions);
  editor.append(timeColumn, details, deleteButton);
  row.append(summary, editor);
  refreshRow();
  return row;
}

// Only one moment is open for editing at a time.
function toggleTagEditor(id) {
  state.expandedTagId = state.expandedTagId === id ? "" : id;
  renderTags();
  const row = document.querySelector(`[data-tag-id="${id}"]`);
  if (state.expandedTagId === id) (row?.querySelector(".event-type") || row?.querySelector(".tag-summary-main"))?.focus();
  else row?.querySelector(".tag-summary-main")?.focus();
}

function groupHeading(tagName, text, count) {
  const heading = document.createElement(tagName);
  heading.className = "moment-group-heading";
  const bubble = document.createElement("span");
  bubble.className = "count-bubble";
  bubble.textContent = count;
  heading.append(`${text} `, bubble);
  return heading;
}

function deleteMoments(tags, listName) {
  if (!tags.length) return;
  if (!window.confirm(`Delete all ${plural(tags.length, "moment")} in ${listName}? You can undo this straight after.`)) return;
  const ids = new Set(tags.map((tag) => tag.id));
  state.tags = state.tags.filter((tag) => !ids.has(tag.id));
  setDirty();
  renderTags();
  notify(`Deleted ${plural(tags.length, "moment")} from ${listName}.`, "success", {
    label: "Undo",
    onClick: () => {
      const present = new Set(state.tags.map((tag) => tag.id));
      state.tags = [...state.tags, ...tags.filter((tag) => !present.has(tag.id))].sort(byTime);
      setDirty();
      renderTags();
      notify(`Restored ${plural(tags.length, "moment")} to ${listName}.`, "success");
    },
  });
}

function sectionHeader(text, tags) {
  const header = document.createElement("div");
  header.className = "moment-group-header";
  header.append(groupHeading("h3", text, tags.length));
  if (tags.length) {
    const deleteAll = document.createElement("button");
    deleteAll.type = "button";
    deleteAll.className = "delete-all";
    deleteAll.textContent = "Delete all";
    deleteAll.setAttribute("aria-label", `Delete all ${plural(tags.length, "moment")} in ${text}`);
    deleteAll.addEventListener("click", () => deleteMoments(tags, text));
    header.append(deleteAll);
  }
  return header;
}

function momentRows(tags, done) {
  const list = document.createElement("ol");
  list.className = "moment-rows";
  list.append(...tags.map((tag) => safeTagRow(tag, done)));
  return list;
}

// One moment that fails to draw must never blank the whole list: show a placeholder row instead and
// log the details, so the rest of the moments stay usable (and still save).
function safeTagRow(tag, done) {
  try {
    return renderTagRow(tag, done);
  } catch (error) {
    console.error("Could not draw the moment", tag, error);
    const row = document.createElement("li");
    row.className = "tag-row incomplete";
    row.dataset.tagId = tag.id;
    const text = document.createElement("p");
    text.className = "tag-status";
    text.textContent = `The moment at ${formatTime(tag.timestampSeconds || 0)} couldn't be shown (${error?.message || error}). It is still saved with the video.`;
    row.append(text);
    return row;
  }
}

// Done groups follow the event-type list (Goal, Assist, Shot…), with custom "Other" names last.
function groupOrder(tag) {
  const index = eventTypes.findIndex(([value]) => value === tag.eventType);
  return tag.eventType === "other" || index < 0 ? eventTypes.length : index;
}

function renderTags() {
  $("#emptyTags").hidden = state.tags.length > 0;
  const todo = state.tags.filter((tag) => !isDone(tag));
  const done = state.tags.filter(isDone);
  const sections = [];
  // Only moments still in To do can be selected for editing several at once.
  state.bulkIds = new Set(todo.filter((tag) => state.bulkIds.has(tag.id)).map((tag) => tag.id));
  renderTagViewSwitch();

  if (state.tags.length && state.tagView === "match") {
    $("#tagList").replaceChildren(matchOrderSection(todo));
    renderPlayerSuggestions();
    renderLastMarked();
    renderTimeline();
    renderVideoHeader();
    refreshActions();
    return;
  }

  if (state.tags.length) {
    const todoSection = document.createElement("section");
    todoSection.className = "moment-group moment-group-todo";
    todoSection.append(sectionHeader("To do", todo));
    if (todo.length > 1) {
      try {
        todoSection.append(bulkBar(todo));
      } catch (error) {
        console.error("Could not draw the edit-several bar", error);
      }
    }
    if (todo.length) {
      todoSection.append(momentRows(todo, false));
    } else {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "Nothing left to do. Mark a moment while you watch.";
      todoSection.append(empty);
    }

    const doneSection = document.createElement("section");
    doneSection.className = "moment-group moment-group-done";
    doneSection.append(sectionHeader("Done", done));
    if (!done.length) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "Moments you mark as done appear here, grouped by event type.";
      doneSection.append(empty);
    }
    const groups = new Map();
    for (const tag of done) {
      const label = tagEventLabel(tag);
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(tag);
    }
    const ordered = [...groups.entries()].sort(([firstLabel, [first]], [secondLabel, [second]]) =>
      groupOrder(first) - groupOrder(second) || firstLabel.localeCompare(secondLabel));
    for (const [label, tags] of ordered) {
      const group = document.createElement("details");
      group.className = "type-group";
      group.open = state.expandedGroups.has(label);
      const summary = document.createElement("summary");
      summary.append(groupHeading("span", label, tags.length));
      group.append(summary, momentRows(tags, true));
      group.addEventListener("toggle", () => {
        if (group.open) state.expandedGroups.add(label);
        else state.expandedGroups.delete(label);
      });
      doneSection.append(group);
    }
    sections.push(todoSection, doneSection);
  }

  $("#tagList").replaceChildren(...sections);
  renderPlayerSuggestions();
  renderLastMarked();
  renderTimeline();
  renderVideoHeader();
  refreshActions();
}

// ---- Tag layout: Match order view, timeline, video header, keys help ----

function renderTagViewSwitch() {
  $("#tagViewMatch").setAttribute("aria-pressed", String(state.tagView === "match"));
  $("#tagViewGroups").setAttribute("aria-pressed", String(state.tagView !== "match"));
}

function setTagView(view) {
  state.tagView = view;
  try {
    window.localStorage.setItem(tagViewStorageKey, view);
  } catch {
    // Remembering the view is a convenience only.
  }
  renderTags();
}

// Every moment in time order, split into halves at the Half-time moment when there is one.
function matchOrderSection(todo) {
  const section = document.createElement("section");
  section.className = "moment-group moment-group-match";
  if (todo.length > 1) {
    try {
      section.append(bulkBar(todo));
    } catch (error) {
      console.error("Could not draw the edit-several bar", error);
    }
  }
  const sorted = [...state.tags].sort(byTime);
  const halfTime = sorted.find((tag) => tag.eventType === "half_time")?.timestampSeconds ?? null;
  const list = document.createElement("ol");
  list.className = "moment-rows";
  const divider = (text) => {
    const item = document.createElement("li");
    item.className = "match-divider";
    item.textContent = text;
    return item;
  };
  if (halfTime !== null) list.append(divider("1st half"));
  let secondHalf = false;
  for (const tag of sorted) {
    if (halfTime !== null && !secondHalf && tag.timestampSeconds > halfTime) {
      list.append(divider("2nd half"));
      secondHalf = true;
    }
    list.append(safeTagRow(tag, isDone(tag)));
  }
  section.append(list);
  return section;
}

function timelinePercent(seconds) {
  const duration = state.videoDuration || 1;
  return `${Math.min(100, Math.max(0, (seconds / duration) * 100))}%`;
}

// Ticks under the video for every moment (markers aside): green when done, amber when it still needs a
// type, white and taller for goals. Click a tick, or anywhere on the bar, to jump there.
function renderTimeline() {
  const bar = $("#timelineBar");
  const show = !!state.activeRecord && state.videoDuration > 0;
  $("#timeline").hidden = !show;
  bar.querySelectorAll(".timeline-tick, .timeline-half").forEach((element) => element.remove());
  if (!show) return;
  const halfTime = state.tags.find((tag) => tag.eventType === "half_time")?.timestampSeconds ?? null;
  $("#timelineHalf").textContent = halfTime === null ? "" : `Half-time ${formatTime(halfTime)}`;
  if (halfTime !== null) {
    const line = document.createElement("div");
    line.className = "timeline-half";
    line.style.left = timelinePercent(halfTime);
    bar.append(line);
  }
  for (const tag of [...state.tags].sort(byTime)) {
    if (markerTypes.has(tag.eventType)) continue;
    const tick = document.createElement("button");
    tick.type = "button";
    tick.className = "timeline-tick";
    if (!isComplete(tag)) tick.classList.add("needs-type");
    else if (tag.eventType === "goal") tick.classList.add("goal");
    tick.style.left = timelinePercent(tag.timestampSeconds);
    const label = `${formatTime(tag.timestampSeconds)} ${isComplete(tag) ? tagEventLabel(tag) : "needs a type"}`;
    tick.title = label;
    tick.setAttribute("aria-label", `Jump to ${label}`);
    tick.addEventListener("mousedown", (event) => event.preventDefault());
    tick.addEventListener("click", (event) => {
      event.stopPropagation();
      state.player?.setCurrentTime(tag.timestampSeconds).catch(() => {});
    });
    bar.append(tick);
  }
}

// The same timeline under the Watch video: one tick per tagged moment (markers aside), goals white.
// A tick plays that moment like clicking it in the list; the bar seeks; the playing clip's tick lights up.
function renderWatchTimeline(record) {
  const bar = $("#watchTimelineBar");
  const duration = state.watchDuration;
  const show = !!record && duration > 0;
  $("#watchTimeline").hidden = !show;
  bar.querySelectorAll(".timeline-tick, .timeline-half").forEach((element) => element.remove());
  if (!show) return;
  const percent = (seconds) => `${Math.min(100, Math.max(0, (seconds / duration) * 100))}%`;
  const tags = watchEvents(record);
  const halfTime = tags.find((tag) => tag.eventType === "half_time")?.timestampSeconds ?? null;
  $("#watchTimelineHalf").textContent = halfTime === null ? "" : `Half-time ${formatTime(halfTime)}`;
  if (halfTime !== null) {
    const line = document.createElement("div");
    line.className = "timeline-half";
    line.style.left = percent(halfTime);
    bar.append(line);
  }
  for (const tag of tags) {
    if (markerTypes.has(tag.eventType)) continue;
    const tick = document.createElement("button");
    tick.type = "button";
    tick.className = "timeline-tick";
    tick.dataset.tagId = tag.id;
    if (tag.eventType === "goal") tick.classList.add("goal");
    tick.style.left = percent(tag.timestampSeconds);
    const who = tag.playerNames ? ` · ${tag.playerNames}` : "";
    const label = `${formatTime(tag.timestampSeconds)} ${tagEventLabel(tag)}${who}`;
    tick.title = label;
    tick.setAttribute("aria-label", `Play ${label}`);
    tick.disabled = !state.watchReady;
    tick.addEventListener("click", (event) => {
      event.stopPropagation();
      playWatchMoment(tag.timestampSeconds);
    });
    bar.append(tick);
  }
  renderPlaylistStatus();
}

// Once a video is open, its form folds into a title; Edit details opens it again.
function renderVideoHeader() {
  const record = state.activeRecord;
  $("#videoHeader").hidden = !record;
  if (!record) {
    $("#tagPanel").classList.remove("editing-details");
    return;
  }
  $("#videoHeaderTitle").textContent = $("#videoName").value.trim() || "Untitled video";
  const team = state.teams.find((item) => item.id === activeTeamId())?.name || "";
  const saved = state.records.some((item) => item.id === record.id);
  const status = !saved ? "New, not saved yet" : record.status === "published" ? "Published" : "In progress";
  $("#videoHeaderMeta").textContent = [team, status].filter(Boolean).join(" · ").toUpperCase();
  const editing = $("#tagPanel").classList.contains("editing-details");
  $("#editDetailsButton").textContent = editing ? "Done" : "Edit details";
  $("#editDetailsButton").setAttribute("aria-expanded", String(editing));
}

function setKeysHelp(open) {
  $("#keysHelp").hidden = !open;
  $("#keysHelpButton").setAttribute("aria-expanded", String(open));
}

function setPlayerReady(ready) {
  state.playerReady = ready;
  refreshActions();
}

// ---- Faster tagging: quick-type keys, shirt numbers, undo, options ----

function loadQuickTypes() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(quickTypesStorageKey) || "null");
    if (Array.isArray(saved)) {
      // Keep the saved order: it decides which key each type gets.
      const valid = [...new Set(saved)].filter((value) => value && value !== "other" && eventTypes.some(([type]) => type === value));
      if (valid.length) return valid.slice(0, quickKeys.length);
    }
  } catch {
    // Storage unavailable or damaged: use the defaults.
  }
  return [...defaultQuickTypes];
}

function eventTypeName(value) {
  return eventTypes.find(([type]) => type === value)?.[1] || value;
}

// The on-screen quick-type buttons under Mark moment, each showing its key.
function renderQuickBar() {
  $("#quickBar").replaceChildren(...state.quickTypes.map((value, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "quick-key";
    button.disabled = !state.playerReady;
    const key = document.createElement("kbd");
    key.textContent = quickKeys[index].toUpperCase();
    button.append(key, ` ${eventTypeName(value)}`);
    button.setAttribute("aria-label", `Mark ${eventTypeName(value)} (key ${quickKeys[index].toUpperCase()})`);
    // Keep keyboard focus where it was, so the keys keep working after a click.
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => markMoment(value));
    return button;
  }));
}

// Tagging options: which event types are quick types (up to nine). Keys follow the order they were
// ticked in, so unticking one never moves the others to different keys except those after it.
function renderQuickTypeChoices() {
  const full = state.quickTypes.length >= quickKeys.length;
  $("#quickTypeChoices").replaceChildren(...eventTypes
    .filter(([value]) => value && value !== "other")
    .map(([value, label]) => {
      const choice = document.createElement("label");
      choice.className = "quick-type-choice";
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = state.quickTypes.includes(value);
      box.disabled = full && !box.checked;
      box.addEventListener("change", () => {
        const chosen = box.checked
          ? [...state.quickTypes, value]
          : state.quickTypes.filter((type) => type !== value);
        if (!chosen.length) {
          box.checked = true;
          notify("Keep at least one quick type.", "error");
          return;
        }
        state.quickTypes = chosen;
        try {
          window.localStorage.setItem(quickTypesStorageKey, JSON.stringify(state.quickTypes));
        } catch {
          // Remembering the choice is a convenience only.
        }
        renderQuickBar();
        renderQuickTypeChoices();
        renderTags();
      });
      choice.append(box, ` ${label}`);
      return choice;
    }));
}

function renderLastMarked() {
  const tag = state.tags.find((item) => item.id === state.lastMarkedId);
  $("#lastMarked").hidden = !tag;
  if (!tag) {
    state.numberBuffer = "";
    return;
  }
  const players = (tag.playerIds || []).map((id) => state.memberById.get(id)).filter(Boolean).map(memberLabel);
  $("#lastMarkedText").textContent = `Last: ${isComplete(tag) ? tagEventLabel(tag) : "untyped moment"} at ${formatTime(tag.timestampSeconds)}${players.length ? ` · ${players.join(", ")}` : ""}`;
  $("#lastMarkedNumber").textContent = state.numberBuffer ? `#${state.numberBuffer}` : "";
  $("#lastMarkedNumber").hidden = !state.numberBuffer;
  const hasSquad = teamPlayers(activeTeamId()).length > 0;
  $("#lastMarkedHint").textContent = [
    hasSquad ? "Shift + shirt number adds a player" : "",
    "Backspace undoes this mark",
  ].filter(Boolean).join(" · ");
}

function assignShirtNumber() {
  const digits = state.numberBuffer;
  state.numberBuffer = "";
  const tag = state.tags.find((item) => item.id === state.lastMarkedId);
  if (!tag || !digits) {
    renderLastMarked();
    return;
  }
  const number = Number(digits);
  const player = teamPlayers(activeTeamId()).find((member) => member.number === number);
  if (!player) {
    notify(`No #${number} in this video's squad.`, "error");
    renderLastMarked();
    return;
  }
  if (!(tag.playerIds || []).includes(player.id)) {
    updateTag(tag.id, { playerIds: [...(tag.playerIds || []), player.id] });
  }
  renderTags();
  notify(`Added ${memberLabel(player)} to the ${isComplete(tag) ? tagEventLabel(tag) : "moment"} at ${formatTime(tag.timestampSeconds)}.`, "success");
}

function undoLastMark() {
  const id = state.lastMarkedId;
  if (!id || !state.tags.some((tag) => tag.id === id)) return;
  state.lastMarkedId = null;
  deleteMoment(id);
}

// After ticking off a moment in the review pass: go to the next one still to do. Only while the video
// is paused, so a tick during live tagging never moves playback or takes the keyboard away.
function goToNextTodo(afterTag) {
  const todo = state.tags.filter((tag) => !isDone(tag)).sort(byTime);
  const next = todo.find((tag) => tag.timestampSeconds >= afterTag.timestampSeconds) || todo[0];
  if (!next || !state.player) return;
  state.player.getPaused()
    .then((paused) => {
      if (!paused) return;
      state.player.setCurrentTime(Math.max(0, next.timestampSeconds - watchLeadSeconds)).catch(() => {});
      state.expandedTagId = next.id;
      renderTags();
      document.querySelector(`[data-tag-id="${next.id}"] .event-type`)?.focus();
    })
    .catch(() => {});
}

// Edit several To do moments at once.
function bulkBar(todo) {
  const ids = todo.filter((tag) => state.bulkIds.has(tag.id)).map((tag) => tag.id);
  const bar = document.createElement("div");
  bar.className = "bulk-bar";
  const allLabel = document.createElement("label");
  allLabel.className = "bulk-all";
  const all = document.createElement("input");
  all.type = "checkbox";
  all.checked = ids.length > 0 && ids.length === todo.length;
  all.indeterminate = ids.length > 0 && ids.length < todo.length;
  all.addEventListener("change", () => {
    state.bulkIds = all.checked ? new Set(todo.map((tag) => tag.id)) : new Set();
    renderTags();
  });
  allLabel.append(all, ids.length ? ` ${ids.length} selected` : " Select all");
  bar.append(allLabel);
  if (!ids.length) return bar;

  const typeSelect = document.createElement("select");
  typeSelect.setAttribute("aria-label", "Set the event type of the selected moments");
  typeSelect.append(new Option("Set type…", ""), ...eventTypes
    .filter(([value]) => value && value !== "other")
    .map(([value, label]) => new Option(label, value)));
  typeSelect.addEventListener("change", () => {
    if (!typeSelect.value) return;
    for (const id of ids) updateTag(id, { eventType: typeSelect.value, customEventType: "" });
    renderTags();
    notify(`Set ${plural(ids.length, "moment")} to ${eventTypeName(typeSelect.value)}.`, "success");
  });
  bar.append(typeSelect);

  const squad = teamPlayers(activeTeamId());
  if (squad.length) {
    const playerSelect = document.createElement("select");
    playerSelect.setAttribute("aria-label", "Add a player to the selected moments");
    playerSelect.append(new Option("Add player…", ""), ...squad.map((member) =>
      new Option(member.number === null ? member.name : `${member.number} · ${member.name}`, member.id)));
    playerSelect.addEventListener("change", () => {
      const member = state.memberById.get(playerSelect.value);
      if (!member) return;
      for (const id of ids) {
        const tag = state.tags.find((item) => item.id === id);
        if (tag && !(tag.playerIds || []).includes(member.id)) updateTag(id, { playerIds: [...(tag.playerIds || []), member.id] });
      }
      renderTags();
      notify(`Added ${memberLabel(member)} to ${plural(ids.length, "moment")}.`, "success");
    });
    bar.append(playerSelect);
  }

  const done = document.createElement("button");
  done.type = "button";
  done.className = "done-button";
  done.textContent = "✓ Done";
  done.addEventListener("click", () => {
    let moved = 0;
    for (const id of ids) {
      const tag = state.tags.find((item) => item.id === id);
      if (tag && isComplete(tag)) {
        updateTag(id, { done: true });
        moved++;
      }
    }
    const skipped = ids.length - moved;
    renderTags();
    notify(`${plural(moved, "moment")} moved to Done.${skipped ? ` ${plural(skipped, "moment")} still ${skipped === 1 ? "needs" : "need"} a type.` : ""}`, moved ? "success" : "error");
  });
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "delete-all";
  remove.textContent = "Delete";
  remove.addEventListener("click", () => {
    deleteMoments(state.tags.filter((tag) => ids.includes(tag.id)), "the selection");
  });
  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "link-button";
  clear.textContent = "Clear";
  clear.addEventListener("click", () => {
    state.bulkIds = new Set();
    renderTags();
  });
  bar.append(done, remove, clear);
  return bar;
}

function markOffsetSeconds() {
  const value = Number($("#markOffset").value);
  return markOffsetChoices.includes(value) ? value : 0;
}

// Marks a moment at the current time (minus the mark offset). With an event type (a quick-type key or
// button) the moment is already complete, so it goes straight to Done; the "Last marked" bar then takes
// shirt numbers for it.
async function markMoment(eventType = "") {
  if (typeof eventType !== "string") eventType = "";
  if (!state.playerReady || !state.player) return;
  try {
    const offset = markOffsetSeconds();
    const timestampSeconds = Math.max(0, await state.player.getCurrentTime() - offset);
    const tag = {
      id: crypto.randomUUID(),
      timestampSeconds,
      eventType,
      customEventType: "",
      playerIds: [],
      otherPlayers: "",
      playerNames: "",
      note: "",
      done: false,
    };
    tag.done = isComplete(tag);
    state.tags = [...state.tags, tag].sort(byTime);
    state.lastMarkedId = tag.id;
    state.numberBuffer = "";
    if ($("#pauseOnMark").checked) state.player.pause().catch(() => {});
    setDirty();
    renderTags();
    if (tag.done) {
      const squad = teamPlayers(activeTeamId()).length > 0;
      notify(`${tagEventLabel(tag)} marked at ${formatTime(timestampSeconds)} and added to Done.${squad ? " Hold Shift and type a shirt number to add a player." : ""}`, "success");
      return;
    }
    const row = document.querySelector(`[data-tag-id="${tag.id}"]`);
    row?.classList.add("just-added");
    // In full screen only the list scrolls. Scroll it directly: scrollIntoView would also move the page.
    if (row && $("#tagger").classList.contains("stage-mode")) {
      const list = $("#tagList");
      const listBox = list.getBoundingClientRect();
      const rowBox = row.getBoundingClientRect();
      if (rowBox.bottom > listBox.bottom) list.scrollTop += rowBox.bottom - listBox.bottom;
      else if (rowBox.top < listBox.top) list.scrollTop -= listBox.top - rowBox.top;
    }
    notify(`Moment marked at ${formatTime(timestampSeconds)}${offset ? ` (${offset} seconds before you pressed)` : ""}. Pick its event type in the list.`, "success");
  } catch (error) {
    notify(`Could not capture the current video time: ${error.message}`, "error");
  }
}

function loadVimeoSdk() {
  if (window.Vimeo?.Player) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existingScript = document.querySelector('script[src="https://player.vimeo.com/api/player.js"]');
    const script = existingScript || document.createElement("script");
    script.src = "https://player.vimeo.com/api/player.js";
    script.async = true;
    script.onload = () => window.Vimeo?.Player
      ? resolve()
      : reject(new Error("Vimeo's player tools did not load."));
    script.onerror = () => reject(new Error("Could not load Vimeo's player tools. Check your internet connection."));
    if (!existingScript) document.head.append(script);
  });
}

function seekBy(deltaSeconds) {
  if (!state.player || !state.playerReady) return;
  state.player.getCurrentTime()
    .then((seconds) => state.player.setCurrentTime(Math.max(0, seconds + deltaSeconds)))
    .catch((error) => notify(`Could not move the video: ${error.message}`, "error"));
}

function togglePlay() {
  if (!state.player || !state.playerReady) return;
  state.player.getPaused()
    .then((paused) => paused ? state.player.play() : state.player.pause())
    .catch((error) => notify(`Could not start or pause the video: ${error.message}`, "error"));
}

function setPlayingLabel(playing) {
  $("#playPauseButton").textContent = playing ? "Pause" : "Play";
}

function updatePlayerClock(seconds) {
  if (state.videoDuration) $("#timelineNow").style.left = timelinePercent(seconds);
  $("#playerClock").textContent = state.videoDuration
    ? `${formatTime(seconds)} / ${formatTime(state.videoDuration)}`
    : formatTime(seconds);
}

// "Stage" is Touchline's own full screen: the video plus its controls, so buttons stay reachable.
// It uses the browser's full screen where available and a full-window view otherwise (e.g. iPhone).
const stageElements = () => [$("#tagger"), $("#watchWorkspace")];

function setStageMode(element, active) {
  element.classList.toggle("stage-mode", active);
  document.body.classList.toggle("stage-open", stageElements().some((item) => item.classList.contains("stage-mode")));
  $("#tagFullscreenButton").textContent = $("#tagger").classList.contains("stage-mode") ? "Exit full screen" : "Full screen";
  $("#watchFullscreenButton").textContent = $("#watchWorkspace").classList.contains("stage-mode") ? "Exit full screen" : "Full screen";
}

async function toggleStage(element) {
  const active = element.classList.contains("stage-mode");
  if (document.fullscreenEnabled) {
    try {
      if (active) await document.exitFullscreen();
      else await element.requestFullscreen();
      return;
    } catch (error) {
      console.warn("Browser full screen is unavailable; using the full-window view instead.", error);
    }
  }
  setStageMode(element, !active);
}

function exitStage() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  for (const element of stageElements()) setStageMode(element, false);
}

function setLibraryHidden(hidden) {
  $("#tagLayout").classList.toggle("library-hidden", hidden);
  $("#toggleLibraryButton").textContent = hidden ? "Show library" : "Hide library";
  $("#toggleLibraryButton").setAttribute("aria-expanded", String(!hidden));
}

function confirmDiscard() {
  return !state.isDirty || window.confirm("You have unsaved changes. Discard them and continue?");
}

async function openVideo(value, record = null) {
  let video;
  try {
    video = parseVimeoUrl(value);
  } catch (error) {
    notify(error.message, "error");
    return;
  }

  if (state.player) {
    try {
      await state.player.destroy();
    } catch (error) {
      console.error("Could not close the previous Vimeo player:", error);
    }
  }

  state.video = video;
  if (record && state.teamsAvailable) {
    renderTeamOptions();
    $("#videoTeam").value = record.teamId && state.teams.some((team) => team.id === record.teamId)
      ? record.teamId
      : (state.teams.length === 1 ? state.teams[0].id : "");
  }
  const teamId = activeTeamId();
  state.tags = record ? (record.tags || []).map((tag) => withPlayers(normalizeTag(tag), teamId)).sort(byTime) : [];
  // A video with no moments yet starts with Start of game at 00:10. It is not an unsaved change on its
  // own: if the admin leaves without saving, it is simply added again next time.
  if (!state.tags.length) state.tags = [startOfGameTag()];
  state.activeRecord = record || {
    id: crypto.randomUUID(),
    title: $("#videoName").value.trim(),
    vimeoUrl: value,
    status: "in_progress",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    publishedAt: null,
    teamId,
    tags: [],
  };
  state.isDirty = false;
  cancelAutosave();
  state.lastMarkedId = null;
  state.numberBuffer = "";
  state.bulkIds = new Set();
  state.player = null;
  state.videoDuration = 0;
  setPlayerReady(false);
  setPlayingLabel(false);
  updatePlayerClock(0);
  $("#saveHint").textContent = record ? `Saved ${record.status === "published" ? "as published" : "in progress"}` : "Not saved yet";
  renderTags();
  renderLibrary();
  $("#tagPanel").classList.add("has-video");
  $("#videoCard").hidden = false;
  $("#tagsCard").hidden = false;
  notify("Loading Vimeo video…");

  const frame = document.createElement("iframe");
  frame.title = "Vimeo video";
  // No "fullscreen" permission: Vimeo's own full screen would hide the tagging controls, so Touchline offers its own.
  frame.allow = "autoplay; picture-in-picture; encrypted-media";
  const embedUrl = new URL(`https://player.vimeo.com/video/${video.id}`);
  if (video.hash) embedUrl.searchParams.set("h", video.hash);
  frame.src = embedUrl.href;
  $("#videoFrame").replaceChildren(frame);
  tagZoom.reset();

  try {
    await loadVimeoSdk();
    state.player = new window.Vimeo.Player(frame);
    state.player.on("error", (error) => {
      notify(`Vimeo player error: ${error.message || "The video could not be played."}`, "error");
    });
    state.player.on("play", () => setPlayingLabel(true));
    state.player.on("pause", () => setPlayingLabel(false));
    state.player.on("ended", () => setPlayingLabel(false));
    state.player.on("timeupdate", ({ seconds }) => updatePlayerClock(seconds));
    await state.player.ready();
    state.videoDuration = await state.player.getDuration().catch(() => 0);
    updatePlayerClock(0);
    renderTimeline();
    setPlayerReady(true);
    notify(record
      ? record.status === "published"
        ? `Opened ${record.title}. It is published: viewers see your edits once you re-publish.`
        : `Opened ${record.title}. Save your progress, or publish it when you're ready.`
      : "Video ready. Use the controls under the video, and press Enter or Mark moment when something happens.", "success");
  } catch (error) {
    state.player = null;
    setPlayerReady(false);
    notify(`Could not open this Vimeo video: ${error.message}`, "error");
  }
}

function videoPayload() {
  const title = $("#videoName").value.trim();
  if (!title || title.length > 200) throw new Error("Enter a video name (up to 200 characters).");
  const vimeoUrl = $("#videoUrl").value.trim();
  const video = parseVimeoUrl(vimeoUrl);
  if (video.id !== state.video.id || video.hash !== state.video.hash) {
    throw new Error("The Vimeo link changed. Open that link before saving its moments.");
  }
  if (state.teamsAvailable && state.teams.length && !activeTeamId()) throw new Error("Choose the team for this video.");
  return {
    id: state.activeRecord.id,
    title,
    vimeoUrl,
    tags: state.tags.map(serializeTag),
  };
}

// mode: "progress" saves as In progress, "publish" saves as Published, "unpublish" takes a published
// video back to In progress (saving any open edits with it).
async function saveVideo(mode = "progress") {
  if (!state.activeRecord || !state.playerReady || state.isSaving) return;
  const publish = mode === "publish";
  const wasPublished = state.activeRecord.status === "published";
  if (mode === "progress" && wasPublished) {
    notify("This video is published. Use Re-publish changes to update what viewers see, or Unpublish to hide it.", "error");
    return;
  }
  if (mode === "unpublish") {
    if (!wasPublished) return;
    const extra = state.isDirty ? " Your unsaved changes will be saved with it." : "";
    if (!window.confirm(`Unpublish "${state.activeRecord.title}"? Viewers will no longer see it, and it moves back to In progress.${extra}`)) return;
  }
  const incomplete = state.tags.filter((tag) => !isComplete(tag)).length;

  let payload;
  try {
    payload = videoPayload();
  } catch (error) {
    notify(error.message, "error");
    return;
  }

  state.isSaving = true;
  refreshActions();
  $("#saveHint").textContent = { publish: "Publishing…", unpublish: "Unpublishing…", progress: "Saving…" }[mode];
  try {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("videos")
      .upsert({
        id: payload.id,
        name: payload.title,
        vimeo_url: payload.vimeoUrl,
        status: publish ? "published" : "in_progress",
        tags: payload.tags,
        updated_at: now,
        published_at: publish ? now : mode === "unpublish" ? null : state.activeRecord.publishedAt,
        ...(state.teamsAvailable ? { team_id: activeTeamId() } : {}),
      }, { onConflict: "id" })
      .select("*")
      .single();
    if (error) throw error;
    const saved = {
      id: data.id,
      title: data.name,
      vimeoUrl: data.vimeo_url,
      status: data.status,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      publishedAt: data.published_at,
      teamId: data.team_id ?? null,
      tags: (data.tags || []).map(cleanTag),
    };
    state.activeRecord = saved;
    state.isDirty = false;
    cancelAutosave();
    state.tags = saved.tags.map((tag) => withPlayers(normalizeTag(tag), saved.teamId)).sort(byTime);
    $("#videoName").value = saved.title;
    $("#videoUrl").value = saved.vimeoUrl;
    $("#saveHint").textContent = `Saved ${saved.status === "published" ? "as published" : "in progress"}`;
    renderTags();
    const hiddenNote = incomplete
      ? ` ${plural(incomplete, "moment")} without an event type ${incomplete === 1 ? "is" : "are"} hidden from viewers.`
      : "";
    notify({
      publish: `${saved.title} is published. Viewers can watch it now.${hiddenNote}`,
      unpublish: `${saved.title} is unpublished. Viewers can no longer see it, and it is back in In progress.`,
      progress: `${saved.title} saved. It stays hidden from viewers until you publish it.`,
    }[mode], "success");
    try {
      await loadLibrary();
    } catch (loadError) {
      notify(`${saved.title} was saved, but the library list could not refresh: ${friendlyError(loadError)}`, "error");
    }
  } catch (error) {
    $("#saveHint").textContent = "Save failed";
    notify(`Video ${{ publish: "publish", unpublish: "unpublish", progress: "save" }[mode]} failed: ${friendlyError(error)}`, "error");
  } finally {
    state.isSaving = false;
    refreshActions();
  }
}

async function startNewVideo() {
  if (state.role !== "admin") return;
  await flushAutosave();
  if (!confirmDiscard()) return;
  if (state.player) {
    try {
      await state.player.destroy();
    } catch (error) {
      console.error("Could not close the Vimeo player:", error);
    }
  }
  state.video = null;
  state.player = null;
  state.activeRecord = null;
  state.tags = [];
  state.isDirty = false;
  cancelAutosave();
  state.lastMarkedId = null;
  state.numberBuffer = "";
  state.bulkIds = new Set();
  exitStage();
  setPlayerReady(false);
  $("#tagPanel").classList.remove("has-video");
  $("#videoName").value = "";
  $("#videoUrl").value = "";
  $("#videoFrame").replaceChildren();
  $("#videoCard").hidden = true;
  $("#tagsCard").hidden = true;
  $("#saveHint").textContent = "Not saved yet";
  renderTags();
  renderLibrary();
  notify("Enter a video name and Vimeo link to start tagging.");
  $("#videoName").focus();
}

function setLoginNotice(message, kind = "") {
  $("#loginNotice").textContent = message;
  $("#loginNotice").className = `notice ${kind}`.trim();
}

// Puts the page back on the sign-in card. Safe to call more than once.
function showSignedOut() {
  state.sessionUserId = null;
  state.role = null;
  state.records = [];
  state.activeRecord = null;
  state.tags = [];
  state.isDirty = false;
  cancelAutosave();
  state.selectedWatchId = "";
  state.watchReady = false;
  state.playlist = null;
  state.playlists = [];
  state.linkedPlaylistId = "";
  state.teams = [];
  state.members = [];
  state.memberById = new Map();
  state.selectedTeamId = "";
  state.editingMemberId = "";
  state.isSaving = false;
  exitStage();
  $("#tagPanel").classList.remove("has-video");
  $("#loginPanel").hidden = false;
  $("#appShell").hidden = true;
  $("#appTabs").hidden = true;
  $("#signOutButton").hidden = true;
  $("#signedInLabel").textContent = "";
  if (state.player) state.player.destroy().catch((error) => console.error("Could not close the Vimeo player:", error));
  if (state.watchPlayer) state.watchPlayer.destroy().catch((error) => console.error("Could not close the watch player:", error));
  state.player = null;
  state.watchPlayer = null;
  state.video = null;
  setPlayerReady(false);
  $("#videoFrame").replaceChildren();
  $("#watchVideoFrame").replaceChildren();
  $("#videoCard").hidden = true;
  $("#tagsCard").hidden = true;
  $("#watchWorkspace").hidden = true;
  $("#watchEmpty").hidden = false;
  $("#loginPassword").value = "";
}

async function activateSession(session) {
  // Signing out always resets the page, whatever happened before.
  if (!session) {
    showSignedOut();
    return;
  }
  // Supabase re-reports the same session on token refresh, tab focus, and sign-in; only react when the user changes.
  if (session.user.id === state.sessionUserId) return;
  state.sessionUserId = session.user.id;

  const { data: userRole, error } = await supabase
    .from("app_users")
    .select("role")
    .eq("user_id", session.user.id)
    .maybeSingle();
  if (error) {
    state.sessionUserId = null;
    throw error;
  }
  if (!userRole || !["admin", "viewer"].includes(userRole.role)) {
    await supabase.auth.signOut({ scope: "local" });
    setLoginNotice("This account does not have an app role. Ask the administrator to assign one.", "error");
    return;
  }

  state.role = userRole.role;
  $("#loginPanel").hidden = true;
  $("#appShell").hidden = false;
  // Viewers only have the Watch tab, so a tab bar would be empty chrome.
  $("#appTabs").hidden = state.role !== "admin";
  $("#signOutButton").hidden = false;
  $("#signedInLabel").textContent = `${userRole.role.toUpperCase()} · ${session.user.email || ""}`;
  try {
    await loadLibrary();
  } catch (loadError) {
    state.sessionUserId = null;
    throw loadError;
  }
  setTab(state.role === "admin" ? "tag" : "watch");
  if (state.role === "admin") notify("Signed in. Your cloud video library is ready.");
  await openLinkedPlaylist();
}

function openPasswordDialog() {
  const dialog = $("#passwordDialog");
  $("#passwordNotice").textContent = "";
  if (!dialog.open) dialog.showModal();
  $("#newPassword").focus();
}

$("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabase) {
    setLoginNotice("Supabase is not configured. Add your project URL and publishable key to public/config.js.", "error");
    return;
  }

  const button = $("#loginButton");
  button.disabled = true;
  setLoginNotice("Signing in…");
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: $("#loginEmail").value.trim(),
      password: $("#loginPassword").value,
    });
    if (error) throw error;
    await activateSession(data.session);
  } catch (error) {
    setLoginNotice(`Could not sign in. ${friendlyError(error)}`, "error");
  } finally {
    button.disabled = false;
  }
});

$("#forgotPasswordButton").addEventListener("click", async () => {
  if (!supabase) return;
  const email = $("#loginEmail").value.trim();
  if (!email || !$("#loginEmail").checkValidity()) {
    setLoginNotice("Enter your email address above, then choose Forgot password.", "error");
    $("#loginEmail").focus();
    return;
  }
  const button = $("#forgotPasswordButton");
  button.disabled = true;
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}${window.location.pathname}`,
    });
    if (error) throw error;
    setLoginNotice(`If ${email} has an account, a password reset link is on its way. Open it on this device.`, "success");
  } catch (error) {
    setLoginNotice(`Could not send the reset email. ${friendlyError(error)}`, "error");
  } finally {
    button.disabled = false;
  }
});

$("#passwordForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = $("#newPassword").value;
  if (password !== $("#confirmPassword").value) {
    $("#passwordNotice").textContent = "The two passwords do not match.";
    return;
  }
  const button = $("#savePasswordButton");
  button.disabled = true;
  try {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    $("#passwordForm").reset();
    $("#passwordDialog").close();
    const message = "Your password has been updated.";
    if (state.role === "admin") notify(message, "success");
    else if (state.role === "viewer") notifyWatch(message, "success");
    else setLoginNotice(message, "success");
  } catch (error) {
    $("#passwordNotice").textContent = friendlyError(error);
  } finally {
    button.disabled = false;
  }
});

$("#cancelPasswordButton").addEventListener("click", () => {
  $("#passwordForm").reset();
  $("#passwordDialog").close();
});

// Removes Supabase's saved sign-in from this browser, for when the sign-out request itself fails.
function forgetStoredSession() {
  try {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith("sb-") && key.endsWith("-auth-token")) window.localStorage.removeItem(key);
    }
  } catch {
    // Storage unavailable: nothing was saved there either.
  }
}

$("#signOutButton").addEventListener("click", async () => {
  await flushAutosave();
  if (!confirmDiscard()) return;
  const button = $("#signOutButton");
  button.disabled = true;
  state.isDirty = false;
  try {
    // "local" signs out this browser only, so people sharing the viewer account stay signed in elsewhere.
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) throw error;
  } catch (error) {
    console.warn("Supabase sign-out failed; clearing the saved sign-in in this browser instead.", error);
    forgetStoredSession();
  }
  // Always leave the app, even if Supabase could not be reached.
  showSignedOut();
  button.disabled = false;
  setLoginNotice("Signed out.", "success");
});

$("#videoForm").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!confirmDiscard()) return;
  const title = $("#videoName").value.trim();
  if (!title) {
    notify("Enter a name for this video.", "error");
    $("#videoName").focus();
    return;
  }
  openVideo($("#videoUrl").value.trim());
});

// Call with no argument: passing markMoment directly would hand it the click event as an event type.
$("#markMomentButton").addEventListener("click", () => markMoment());
$("#saveVideoButton").addEventListener("click", () => saveVideo("progress"));
$("#publishVideoButton").addEventListener("click", () => saveVideo("publish"));
$("#unpublishVideoButton").addEventListener("click", () => saveVideo("unpublish"));
$("#newVideoButton").addEventListener("click", startNewVideo);
$("#queueVideoButton").addEventListener("click", addToQueue);
document.querySelectorAll(".tab-button").forEach((button) => {
  button.addEventListener("click", () => setTab(button.dataset.tab));
});
$("#watchTeamFilter").addEventListener("change", () => {
  state.watchTeamFilter = $("#watchTeamFilter").value;
  renderWatchVideoList();
});
// Choose clips: tick boxes, Select all, Play selected and Save as playlist only show in this mode.
function setWatchChoosing(on) {
  state.watchChoosing = on;
  $("#watchEventsCard").classList.toggle("choosing", on);
  $("#chooseClipsButton").setAttribute("aria-pressed", String(on));
  $("#chooseClipsButton").textContent = on ? "Done choosing" : "Choose clips";
  try {
    window.localStorage.setItem(watchChoosingStorageKey, String(on));
  } catch {
    // Remembering the mode is a convenience only.
  }
}
$("#chooseClipsButton").addEventListener("click", () => setWatchChoosing(!state.watchChoosing));
try {
  setWatchChoosing(window.localStorage.getItem(watchChoosingStorageKey) === "true");
} catch {
  setWatchChoosing(false);
}
$("#playSelectedButton").addEventListener("click", () => {
  const tags = selectedWatchTags();
  const types = new Set(tags.map(tagEventLabel));
  startPlaylist(tags, types.size === 1 ? [...types][0] : "Selected clips");
});
$("#addTeamForm").addEventListener("submit", addTeam);
$("#renameTeamForm").addEventListener("submit", renameTeam);
$("#deleteTeamButton").addEventListener("click", deleteTeam);
$("#addPlayerForm").addEventListener("submit", (event) => addMember("player", event));
$("#addStaffForm").addEventListener("submit", (event) => addMember("staff", event));
$("#videoTeam").addEventListener("change", () => {
  if (!state.activeRecord) return;
  // Picked players belong to the old team's squad: turn them back into names, then link any names
  // that match the new team's squad.
  state.tags = state.tags.map((tag) => {
    const names = [
      ...(tag.playerIds || []).map((id) => state.memberById.get(id)?.name).filter(Boolean),
      ...splitNames(tag.otherPlayers),
    ];
    const { playerIds, ...rest } = tag;
    return withPlayers({ ...rest, playerNames: names.join(", ") }, activeTeamId());
  });
  setDirty();
  renderTags();
});
$("#watchViewEventsButton").addEventListener("click", () => setWatchView("events"));
$("#watchViewStatsButton").addEventListener("click", () => setWatchView("stats"));
$("#savePlaylistButton").addEventListener("click", openPlaylistDialog);
$("#playlistForm").addEventListener("submit", savePlaylist);
$("#cancelPlaylistButton").addEventListener("click", () => $("#playlistDialog").close());
window.addEventListener("hashchange", () => {
  openLinkedPlaylist().catch((error) => console.error("Could not open the linked playlist:", error));
});
$("#selectAllTypesButton").addEventListener("click", () => {
  const record = currentWatchRecord();
  if (!record) return;
  const ids = watchEvents(record).map((tag) => tag.id);
  if (ids.every((id) => state.watchSelectedIds.has(id))) state.watchSelectedIds.clear();
  else state.watchSelectedIds = new Set(ids);
  renderWatchEvents(record);
});
$("#playlistPrevButton").addEventListener("click", () => {
  if (state.playlist) playClip(state.playlist.index - 1);
});
$("#playlistNextButton").addEventListener("click", () => {
  if (state.playlist) playClip(state.playlist.index + 1);
});
$("#playlistStopButton").addEventListener("click", () => {
  if (!state.playlist) return;
  state.watchPlayer?.pause().catch(() => {});
  stopPlaylist();
  notifyWatch("Stopped the clips.", "success");
});
try {
  const savedLength = window.localStorage.getItem(clipLengthStorageKey);
  if (clipLengthChoices.includes(Number(savedLength))) $("#clipLength").value = savedLength;
} catch {
  // Storage can be unavailable (private mode); the default clip length still works.
}
$("#clipLength").addEventListener("change", () => {
  // A running playlist picks up the new length from its next clip onwards.
  const length = clipLengthSeconds();
  if (state.playlist) {
    for (const clip of state.playlist.clips.slice(state.playlist.index + 1)) clip.end = clip.start + length;
  }
  try {
    window.localStorage.setItem(clipLengthStorageKey, String(length));
  } catch {
    // Remembering the choice is a convenience only.
  }
  refreshWatchControls();
});
$("#watchMomentsButton").addEventListener("click", () => {
  const record = currentWatchRecord();
  if (record) startPlaylist(taggedMoments(record), "All tagged moments");
});
$("#watchWholeVideoButton").addEventListener("click", () => {
  if (!state.watchPlayer) return;
  stopPlaylist();
  state.watchPlayer.setCurrentTime(0).catch((error) => {
    notifyWatch(`Could not rewind the video: ${error.message}`, "error");
  });
  state.watchPlayer.play().catch((error) => {
    notifyWatch(`Started at the beginning, but could not start playback: ${error.message}`, "error");
  });
  notifyWatch("Playing from the beginning.", "success");
});
for (const selector of ["#videoName", "#videoUrl"]) {
  $(selector).addEventListener("input", () => {
    if (state.activeRecord) setDirty();
  });
}

try {
  const savedOffset = window.localStorage.getItem(markOffsetStorageKey);
  if (markOffsetChoices.includes(Number(savedOffset))) $("#markOffset").value = savedOffset;
} catch {
  // Storage can be unavailable (private mode); the default offset still works.
}
$("#markOffset").addEventListener("change", () => {
  try {
    window.localStorage.setItem(markOffsetStorageKey, $("#markOffset").value);
  } catch {
    // Remembering the choice is a convenience only.
  }
});

state.quickTypes = loadQuickTypes();
renderQuickBar();
renderQuickTypeChoices();
try {
  $("#pauseOnMark").checked = window.localStorage.getItem(pauseOnMarkStorageKey) === "true";
} catch {
  // Default: keep playing when marking.
}
$("#pauseOnMark").addEventListener("change", () => {
  try {
    window.localStorage.setItem(pauseOnMarkStorageKey, String($("#pauseOnMark").checked));
  } catch {
    // Remembering the choice is a convenience only.
  }
});
try {
  const savedView = window.localStorage.getItem(tagViewStorageKey);
  if (savedView === "match" || savedView === "groups") state.tagView = savedView;
} catch {
  // Default: Match order.
}
$("#tagViewMatch").addEventListener("click", () => setTagView("match"));
$("#tagViewGroups").addEventListener("click", () => setTagView("groups"));
$("#keysHelpButton").addEventListener("mousedown", (event) => event.preventDefault());
$("#keysHelpButton").addEventListener("click", () => setKeysHelp($("#keysHelp").hidden));
document.addEventListener("click", (event) => {
  if ($("#keysHelp").hidden) return;
  if (event.target instanceof Node && ($("#keysHelp").contains(event.target) || $("#keysHelpButton").contains(event.target))) return;
  setKeysHelp(false);
});
$("#editDetailsButton").addEventListener("click", () => {
  $("#tagPanel").classList.toggle("editing-details");
  renderVideoHeader();
  if ($("#tagPanel").classList.contains("editing-details")) $("#videoName").focus();
});
$("#videoName").addEventListener("input", () => renderVideoHeader());
$("#watchTimelineBar").addEventListener("click", (event) => {
  if (!state.watchPlayer || !state.watchDuration || !state.watchReady) return;
  const box = $("#watchTimelineBar").getBoundingClientRect();
  const seconds = ((event.clientX - box.left) / box.width) * state.watchDuration;
  state.watchPlayer.setCurrentTime(Math.max(0, Math.min(state.watchDuration, seconds))).catch(() => {});
});
$("#timelineBar").addEventListener("mousedown", (event) => event.preventDefault());
$("#timelineBar").addEventListener("click", (event) => {
  if (!state.player || !state.videoDuration) return;
  const box = $("#timelineBar").getBoundingClientRect();
  const seconds = ((event.clientX - box.left) / box.width) * state.videoDuration;
  state.player.setCurrentTime(Math.max(0, Math.min(state.videoDuration, seconds))).catch(() => {});
});
$("#lastMarkedUndo").addEventListener("mousedown", (event) => event.preventDefault());
$("#lastMarkedUndo").addEventListener("click", undoLastMark);

$("#rewindButton").addEventListener("click", () => seekBy(-seekStepSeconds));
$("#forwardButton").addEventListener("click", () => seekBy(seekStepSeconds));
$("#playPauseButton").addEventListener("click", togglePlay);
$("#tagFullscreenButton").addEventListener("click", () => toggleStage($("#tagger")));
$("#watchFullscreenButton").addEventListener("click", () => toggleStage($("#watchWorkspace")));
document.addEventListener("fullscreenchange", () => {
  for (const element of stageElements()) setStageMode(element, document.fullscreenElement === element);
});
// Clicking these buttons must not take keyboard focus, or the next Enter/Space would press them again
// instead of marking a moment or pausing. Keyboard users can still Tab to them.
const tagZoom = createZoom($("#videoFrame"), {
  zoomIn: $("#tagZoomIn"), zoomOut: $("#tagZoomOut"), reset: $("#tagZoomReset"), level: $("#tagZoomLevel"),
}, togglePlay);
const watchZoom = createZoom($("#watchVideoFrame"), {
  zoomIn: $("#watchZoomIn"), zoomOut: $("#watchZoomOut"), reset: $("#watchZoomReset"), level: $("#watchZoomLevel"),
}, () => {
  state.watchPlayer?.getPaused()
    .then((paused) => paused ? state.watchPlayer.play() : state.watchPlayer.pause())
    .catch((error) => notifyWatch(`Could not start or pause the video: ${error.message}`, "error"));
});
tagZoom.reset();
watchZoom.reset();

for (const selector of ["#markMomentButton", "#rewindButton", "#playPauseButton", "#forwardButton", "#tagFullscreenButton", "#tagZoomIn", "#tagZoomOut", "#tagZoomReset"]) {
  $(selector).addEventListener("mousedown", (event) => event.preventDefault());
}

try {
  setLibraryHidden(window.localStorage.getItem(libraryHiddenStorageKey) === "true");
} catch {
  setLibraryHidden(false);
}
$("#toggleLibraryButton").addEventListener("click", () => {
  const hidden = !$("#tagLayout").classList.contains("library-hidden");
  setLibraryHidden(hidden);
  try {
    window.localStorage.setItem(libraryHiddenStorageKey, String(hidden));
  } catch {
    // Remembering the choice is a convenience only.
  }
});

window.addEventListener("keydown", (event) => {
  // The full-window fallback has no browser Esc handling, so provide it.
  if (event.key === "Escape" && !document.fullscreenElement && document.body.classList.contains("stage-open")) {
    exitStage();
    return;
  }
  if (state.role !== "admin" || state.activeTab !== "tag" || $("#passwordDialog").open) return;
  const target = event.target;
  if (target instanceof HTMLElement && (
    target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
  )) return;
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  // Shift + shirt number adds a player to the moment just marked: hold Shift, type the digits, let go
  // of Shift. event.code is used because Shift turns 9 into "(" on most keyboards.
  const digit = /^(?:Digit|Numpad)([0-9])$/.exec(event.code)?.[1];
  if (event.shiftKey && digit !== undefined) {
    if (!state.lastMarkedId) return;
    event.preventDefault();
    if (state.numberBuffer.length < 3) state.numberBuffer += digit;
    state.shiftNumber = true;
    renderLastMarked();
    return;
  }
  // "+" needs Shift on most keyboards, so it is the one other key allowed with Shift.
  if (event.shiftKey && event.key !== "+") return;
  const onButton = target instanceof HTMLElement && target.tagName === "BUTTON";
  const quickIndex = quickKeys.indexOf(event.key.toLowerCase());
  const actions = {
    // Enter after a typed shirt number adds that player; otherwise it marks an untyped moment.
    Enter: () => (state.numberBuffer ? assignShirtNumber() : markMoment()),
    " ": () => togglePlay(),
    ArrowLeft: () => seekBy(-seekStepSeconds),
    ArrowRight: () => seekBy(seekStepSeconds),
    "+": () => tagZoom.zoomIn(),
    "=": () => tagZoom.zoomIn(),
    "-": () => tagZoom.zoomOut(),
    Backspace: () => {
      if (state.numberBuffer) {
        state.numberBuffer = state.numberBuffer.slice(0, -1);
        renderLastMarked();
      } else {
        undoLastMark();
      }
    },
    Escape: () => {
      state.numberBuffer = "";
      setKeysHelp(false);
      renderLastMarked();
    },
  };
  let action = actions[event.key];
  if (!action && /^[0-9]$/.test(event.key) && state.lastMarkedId) {
    action = () => {
      if (state.numberBuffer.length < 3) state.numberBuffer += event.key;
      renderLastMarked();
    };
  }
  if (!action && quickIndex >= 0 && quickIndex < state.quickTypes.length && !event.shiftKey) {
    if (event.repeat) return;
    action = () => markMoment(state.quickTypes[quickIndex]);
  }
  if (!action) return;
  // Enter and Space on a focused button should press that button, as usual.
  if (onButton && (event.key === "Enter" || event.key === " ")) return;
  if (event.repeat && (event.key === "Enter" || event.key === " ")) return;
  event.preventDefault();
  action();
});

// The Vimeo player is in its own frame: once someone clicks inside it, it has the keyboard and the
// page hears no keys. The window loses focus when that happens, so say so instead of failing silently.
// (Switching to another app or tab also blurs the window; only a focused video frame shows the banner.)
window.addEventListener("blur", () => {
  window.setTimeout(() => {
    const active = document.activeElement;
    const videoHasKeys = active?.tagName === "IFRAME" && $("#videoFrame").contains(active);
    $("#keysPaused").hidden = !(videoHasKeys && state.role === "admin" && state.activeTab === "tag");
  }, 0);
});
window.addEventListener("focus", () => {
  $("#keysPaused").hidden = true;
});
$("#keysPausedButton").addEventListener("click", () => {
  $("#keysPausedButton").blur();
  $("#keysPaused").hidden = true;
});

// Letting go of Shift after Shift + shirt number adds that player.
window.addEventListener("keyup", (event) => {
  if (event.key !== "Shift" || !state.shiftNumber) return;
  state.shiftNumber = false;
  if (state.numberBuffer) assignShirtNumber();
});

if (!supabase) {
  setLoginNotice("Supabase is not configured. Add your project URL and publishable key to public/config.js.", "error");
  $("#forgotPasswordButton").hidden = true;
} else {
  supabase.auth.onAuthStateChange((event, session) => {
    window.setTimeout(() => {
      if (event === "PASSWORD_RECOVERY") openPasswordDialog();
      activateSession(session).catch((error) => {
        console.error("Could not initialize the signed-in session:", error);
        setLoginNotice(`Could not load your account permissions. ${friendlyError(error)}`, "error");
      });
    }, 0);
  });
  supabase.auth.getSession().then(({ data, error }) => {
    if (error) throw error;
    return activateSession(data.session);
  }).catch((error) => {
    console.error("Could not restore the signed-in session:", error);
    setLoginNotice(`Could not restore your session. ${friendlyError(error)}`, "error");
  });
}

window.addEventListener("beforeunload", (event) => {
  if (!state.isDirty) return;
  event.preventDefault();
  event.returnValue = "";
});
