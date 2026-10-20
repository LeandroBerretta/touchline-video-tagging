import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const $ = (selector) => document.querySelector(selector);
const config = window.TOUCHLINE_CONFIG;
// An invite link signs the new person in with "type=invite" in the address; read it before Supabase
// tidies the address, so they can be asked to choose a password.
const arrivedFromInvite = /(?:^|[#&])type=invite(?:&|$)/.test(window.location.hash);
const supabase = config?.url && config?.publishableKey
  ? createClient(config.url, config.publishableKey)
  : null;
const eventTypes = [
  ["", "Choose event type…"],
  ["start_of_game", "Start of game"],
  ["goal", "Goal"],
  ["shot_on_target", "Shot on target"],
  ["shot_off_target", "Shot off target"],
  ["chance_created", "Chance created"],
  ["save", "Save"],
  ["pass", "Pass"],
  ["pass_sequence", "Pass sequence"],
  ["through_ball", "Through ball"],
  ["switch_of_play", "Switch of play"],
  ["cross", "Cross"],
  ["break_away", "Break away"],
  ["break_away_pass", "Break away pass"],
  ["counter_attack", "Counter-attack"],
  ["header", "Header"],
  ["throw_in", "Throw-in"],
  ["goal_kick", "Goal kick"],
  ["kick_off", "Kick-off"],
  ["foul_won", "Foul won"],
  ["foul_conceded", "Foul conceded"],
  ["hand_ball_won", "Hand ball won"],
  ["hand_ball_conceded", "Hand ball conceded"],
  ["yellow_card", "Yellow card"],
  ["red_card", "Red card"],
  ["penalty", "Penalty"],
  ["free_kick", "Free kick"],
  ["corner", "Corner"],
  ["offside", "Offside"],
  ["ball_won", "Ball won"],
  ["ball_lost", "Ball lost"],
  ["clearance", "Clearance"],
  ["substitution", "Substitution"],
  ["great_play", "Great play"],
  ["coaching_point", "Coaching point"],
  ["half_time", "Half-time"],
  ["end_of_game", "End of game"],
  ["other", "Other"],
];
// Types no longer offered. Moments that already use one keep its name and can be changed to another type.
const retiredEventTypes = [
  ["assist", "Assist"],
  ["carry", "Carry"],
  ["dribble", "Dribble"],
  ["tackle", "Tackle"],
  ["interception", "Interception"],
  ["block", "Block"],
  ["foul", "Foul"],
  ["hand_ball", "Hand ball"],
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
// Quick types saved before a type was split carry over as its replacements.
const replacedQuickTypes = { foul: ["foul_won", "foul_conceded"], hand_ball: ["hand_ball_won", "hand_ball_conceded"] };
// Pass sequences shorter than this are not kept when the chain ends (0 keeps all). Per device.
const minPassesStorageKey = "touchline.minPasses";
const minPassesChoices = [0, 2, 3, 4, 5, 6];
const defaultMinPasses = 3;
// Moments of these types are saved this many seconds before the tap or key press, live and on video,
// so their clips include the build-up. Other types use the Mark setting on video and the tap time live.
const typeLeadsStorageKey = "touchline.typeLeads";
const defaultTypeLeads = { throw_in: 3, shot_on_target: 10, shot_off_target: 10, foul_won: 5, foul_conceded: 5, goal: 15, cross: 7 };
// Types left off the timelines under the video: too frequent to be worth a tick.
const timelineHiddenTypes = new Set(["throw_in"]);
// These get their own second bar under the video, so the main bar shows the match's events clearly.
const secondTimelineTypes = new Set(["pass_sequence", "other"]);
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
  [/permission denied for table app_users/i, "The Users tab needs a one-time database update: run database/005_users.sql in the Supabase SQL Editor."],
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
  libraryQuery: "",
  libraryTeam: "",
  watchDuration: 0,
  watchChoosing: false,
  clipFilterType: "",
  clipFilterPlayer: "",
  clipFilterPasses: 0,
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
  // Live mode: the match being tagged on this device (see "Live mode" below).
  live: null,
  liveSyncTimer: null,
  liveSyncing: false,
  liveSyncAgain: false,
  liveTicker: null,
  liveTypeTargetId: "",
  wakeLock: null,
  alignNudge: 0,
  // The open video is a live match with no Vimeo link yet: its moments can be edited and saved, and
  // the video is attached from the box where the player would be.
  noVideo: false,
  // The Pass sequence being counted in the Tag screen (P adds a pass, L ends it).
  passChainId: null,
  // Users tab: accounts from the admin-users Edge Function.
  users: [],
  usersAvailable: true,
  usersQuery: "",
  editingUserId: "",
  invitePrompted: false,
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
  $("#livePanel").hidden = tab !== "live";
  $("#usersPanel").hidden = tab !== "users";
  if (tab === "users") loadUsers();
  document.body.classList.toggle("live-open", tab === "live");
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
    // Live moments keep the time they were tagged, so they can be lined up with the video again later.
    ...(typeof tag.liveAt === "number" ? { liveAt: tag.liveAt, liveHalf: tag.liveHalf === 2 ? 2 : 1 } : {}),
    ...(tag.liveAnchor ? { liveAnchor: tag.liveAnchor } : {}),
    ...(passCountText(tag) ? { passCount: tag.passCount } : {}),
    ...(isOpponent(tag) ? { side: "opponent" } : {}),
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
    && state.activeRecord.status !== "published" && (state.playerReady || state.noVideo);
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
  if (!state.activeRecord || !(state.playerReady || state.noVideo)) return "";
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
  const canSave = isAdmin && !!state.activeRecord && (state.playerReady || state.noVideo) && !state.isSaving;
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
  for (const selector of ["#passChainButton", "#passChainPlus", "#passChainMinus", "#passChainStop"]) {
    $(selector).disabled = !isAdmin || !state.playerReady;
  }
  document.querySelectorAll(".tag-time, .use-video-time, .quick-key").forEach((button) => { button.disabled = !state.playerReady; });
}

// "Not started" is not stored separately: an unpublished video with no moments yet is in the queue,
// and it moves to In progress as soon as it is saved with a moment.
function librarySection(record) {
  if (record.status === "published") return "published";
  // A match tagged live has no Vimeo link until its video is attached.
  if (!record.vimeoUrl) return "waiting";
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

// Library search and team filter: the search matches video names (ignoring capitals); the team filter
// only appears once there is more than one team.
function libraryFilterActive() {
  return !!state.libraryQuery.trim() || !!state.libraryTeam;
}

function matchesLibraryFilter(record) {
  const query = state.libraryQuery.trim().toLowerCase();
  return (!query || record.title.toLowerCase().includes(query))
    && (!state.libraryTeam || record.teamId === state.libraryTeam);
}

function renderLibraryTeamFilter() {
  const usedTeams = state.teams.filter((team) => state.records.some((record) => record.teamId === team.id));
  $("#libraryTeamFilter").hidden = usedTeams.length < 2;
  if (!usedTeams.some((team) => team.id === state.libraryTeam)) state.libraryTeam = "";
  const select = $("#libraryTeamFilter");
  select.replaceChildren(new Option("All teams", ""), ...usedTeams.map((team) => new Option(team.name, team.id)));
  select.value = state.libraryTeam;
}

function renderLibrary() {
  renderLibraryTeamFilter();
  const filtering = libraryFilterActive();
  const waiting = state.records.filter((record) => librarySection(record) === "waiting");
  $("#waitingSection").hidden = !waiting.length;
  for (const [status, listSelector, countSelector, emptyMessage] of [
    ["waiting", "#waitingList", "#waitingCount", ""],
    ["queued", "#queueList", "#queueCount", "Nothing waiting. Use Add to queue to line up a video."],
    ["in_progress", "#inProgressList", "#inProgressCount", "No videos in progress."],
    ["published", "#publishedList", "#publishedCount", "No published videos yet."],
  ]) {
    const records = state.records.filter((record) => librarySection(record) === status && matchesLibraryFilter(record));
    // The queue is first come, first served; the other lists show the most recently updated first.
    if (status === "queued") records.sort((first, second) => first.createdAt.localeCompare(second.createdAt));
    $(countSelector).textContent = records.length;
    const list = $(listSelector);
    if (!records.length) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = filtering ? "No matching videos." : emptyMessage;
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
      const liveHere = state.live?.id === record.id && !state.live.endedAt;
      const noVideo = !record.vimeoUrl;
      details.textContent = status === "waiting"
        ? [teamName, liveHere ? "Live now" : "Tagged live", plural(record.tags.filter((tag) => !markerTypes.has(tag.eventType) && !tag.liveAnchor).length, "moment"), "No video yet"].filter(Boolean).join(" · ")
        : status === "queued"
        ? [teamName, `Added ${new Date(record.createdAt).toLocaleDateString()}`].filter(Boolean).join(" · ")
        : [
          teamName,
          plural(record.tags.filter((tag) => !markerTypes.has(tag.eventType)).length, "moment"),
          incomplete ? `${incomplete} need${incomplete === 1 ? "s" : ""} a type` : "",
          `Updated ${new Date(record.updatedAt).toLocaleDateString()}`,
          noVideo ? "No video yet" : "",
        ].filter(Boolean).join(" · ");
      button.append(title, details);
      button.addEventListener("click", async () => {
        if (noVideo) {
          if (liveHere) openLive();
          else await openWithoutVideo(record);
          return;
        }
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
        if (status === "waiting" && !liveHere) {
          const publishButton = document.createElement("button");
          publishButton.type = "button";
          publishButton.className = "remove-video";
          publishButton.textContent = "Publish without video";
          publishButton.setAttribute("aria-label", `Publish ${record.title} without its video`);
          publishButton.addEventListener("click", () => publishWithoutVideo(record));
          actions.append(publishButton);
        }
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
    details.textContent = [team, when ? new Date(when).toLocaleDateString() : "", plural(moments, "moment"), record.vimeoUrl ? "" : "Video coming soon"].filter(Boolean).join(" · ");
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

// Lets viewers see a live match's events and stats before its video is ready. Clips play once the video
// is attached, lined up and re-published.
async function publishWithoutVideo(record) {
  if (!window.confirm(`Publish "${record.title}" without its video? Viewers see its events and stats now. Clips play once you attach the video and re-publish.`)) return;
  try {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("videos")
      .update({ status: "published", published_at: now, updated_at: now, tags: withMatchClock(record.tags.map(normalizeTag)).map(serializeTag) })
      .eq("id", record.id)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Video was not found or you do not have permission to change it.");
    await loadLibrary();
    notify(`"${record.title}" is published without its video. Viewers can see its events and stats in Watch.`, "success");
  } catch (error) {
    notify(`Could not publish "${record.title}": ${friendlyError(error)}`, "error");
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
    const match = eventTypes.find(([value]) => value === tag.eventType) || retiredEventTypes.find(([value]) => value === tag.eventType);
    return match?.[1] || tag.eventType.replaceAll("_", " ");
  }
  return "Unclassified moment";
}

// A moment is ours unless it is marked as the opponent's (side "opponent"), e.g. their goal.
function isOpponent(tag) {
  return tag?.side === "opponent";
}

// "6 passes" for a pass sequence with a count, otherwise "".
function passCountText(tag) {
  const count = tag?.eventType === "pass_sequence" ? tag.passCount : 0;
  return Number.isInteger(count) && count > 0 ? `${count} pass${count === 1 ? "" : "es"}` : "";
}

function watchEventTitle(tag) {
  const label = tagEventLabel(tag);
  const details = [isOpponent(tag) ? "Opponent" : "", passCountText(tag), tag.playerNames, tag.note].filter(Boolean).join(" · ");
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
  const shown = record ? watchEvents(record).filter((tag) => matchesClipFilter(tag, record.teamId)) : [];
  const allShownTicked = shown.length > 0 && shown.every((tag) => state.watchSelectedIds.has(tag.id));
  const moments = record ? taggedMoments(record) : [];
  const minutes = Math.max(1, Math.round(playlistSeconds(moments, clipLengthSeconds()) / 60));
  $("#watchMomentsButton").disabled = !ready || !moments.length;
  $("#watchMomentsButton").textContent = moments.length ? `▶ Tagged moments only (about ${minutes} min)` : "▶ Tagged moments only";
  $("#watchMomentsButton").title = moments.length
    ? `Plays all ${plural(moments.length, "moment")} back to back, ${clipLengthSeconds()} seconds each, skipping the rest of the match`
    : "This video has no tagged moments yet";
  $("#playSelectedButton").disabled = !ready || !selected.length;
  $("#playSelectedButton").textContent = selected.length ? `▶ Play selected (${plural(selected.length, "clip")})` : "▶ Play selected";
  $("#selectAllTypesButton").textContent = clipFilterActive()
    ? (allShownTicked ? "Untick shown" : "Select all shown")
    : (allShownTicked ? "Clear selection" : "Select all");
  $("#savePlaylistButton").hidden = state.role !== "admin";
  $("#savePlaylistButton").disabled = !selected.length || !state.playlistsAvailable;
  document.querySelectorAll(".watch-event, .watch-group-play, .stat-play").forEach((button) => { button.disabled = !ready; });
}

// The people a moment names, as filter keys: squad players by id, other names by spelling.
function clipPeople(tag, teamId) {
  const { ids, others } = tagPlayers(tag, teamId);
  return [
    ...(isOpponent(tag) ? [{ key: "side:opponent", label: "Opponent" }] : []),
    ...ids.filter((id) => state.memberById.has(id)).map((id) => ({ key: `id:${id}`, label: memberLabel(state.memberById.get(id)) })),
    ...others.map((name) => ({ key: `name:${normalizeName(name)}`, label: name })),
  ];
}

function clipFilterActive() {
  return state.watchChoosing && (!!state.clipFilterType || !!state.clipFilterPlayer || !!state.clipFilterPasses);
}

function matchesClipFilter(tag, teamId) {
  if (!clipFilterActive()) return true;
  if (state.clipFilterType && tagEventLabel(tag) !== state.clipFilterType) return false;
  if (state.clipFilterPlayer && !clipPeople(tag, teamId).some((person) => person.key === state.clipFilterPlayer)) return false;
  if (state.clipFilterPasses && !(tag.eventType === "pass_sequence" && (tag.passCount || 0) >= state.clipFilterPasses)) return false;
  return true;
}

// Choose clips filters: event types and people found in this video's events.
function renderClipFilters(record) {
  const all = watchEvents(record);
  const types = [...new Set(all.map(tagEventLabel))];
  const people = new Map();
  for (const tag of all) for (const person of clipPeople(tag, record.teamId)) people.set(person.key, person.label);
  if (!types.includes(state.clipFilterType)) state.clipFilterType = "";
  if (!people.has(state.clipFilterPlayer)) state.clipFilterPlayer = "";
  const typeSelect = $("#clipFilterType");
  typeSelect.replaceChildren(new Option("All event types", ""), ...all
    .filter((tag, index) => all.findIndex((other) => tagEventLabel(other) === tagEventLabel(tag)) === index)
    .sort((first, second) => groupOrder(first) - groupOrder(second) || tagEventLabel(first).localeCompare(tagEventLabel(second)))
    .map((tag) => new Option(tagEventLabel(tag), tagEventLabel(tag))));
  typeSelect.value = state.clipFilterType;
  const playerSelect = $("#clipFilterPlayer");
  playerSelect.replaceChildren(new Option("All players", ""), ...[...people.entries()]
    .sort(([firstKey, first], [secondKey, second]) => (firstKey.startsWith("id:") === secondKey.startsWith("id:") ? first.localeCompare(second, undefined, { numeric: true }) : firstKey.startsWith("id:") ? -1 : 1))
    .map(([key, label]) => new Option(label, key)));
  playerSelect.value = state.clipFilterPlayer;
  // Passes: only offered when the video has pass sequences, up to its longest one.
  const longest = Math.max(0, ...all.filter((tag) => tag.eventType === "pass_sequence").map((tag) => tag.passCount || 0));
  const passSelect = $("#clipFilterPasses");
  passSelect.hidden = !longest;
  const steps = [2, 3, 4, 5, 6, 8, 10, 15].filter((count) => count <= longest);
  if (!steps.includes(state.clipFilterPasses)) state.clipFilterPasses = 0;
  passSelect.replaceChildren(new Option("Any passes", "0"), ...steps.map((count) => new Option(`Pass sequences of ${count}+`, String(count))));
  passSelect.value = String(state.clipFilterPasses);
}

function renderWatchEvents(record) {
  renderClipFilters(record);
  const tags = watchEvents(record).filter((tag) => matchesClipFilter(tag, record.teamId));
  const groups = new Map();
  for (const tag of tags) {
    const label = tagEventLabel(tag);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(tag);
  }
  const presentIds = new Set(watchEvents(record).map((tag) => tag.id));
  for (const id of [...state.watchSelectedIds]) {
    if (!presentIds.has(id)) state.watchSelectedIds.delete(id);
  }
  const ordered = [...groups.entries()].sort(([firstLabel, [first]], [secondLabel, [second]]) =>
    groupOrder(first) - groupOrder(second) || firstLabel.localeCompare(secondLabel));

  const total = watchEvents(record).length;
  const filtering = clipFilterActive();
  $("#watchEventCount").textContent = filtering ? `${tags.length} of ${total}` : total;
  $("#watchNoEvents").hidden = tags.length > 0;
  $("#watchNoEvents").textContent = filtering ? "No events match these filters." : "This video has no tagged events yet.";
  $("#watchPlaylistControls").hidden = total === 0;
  $("#watchGroups").replaceChildren(...ordered.map(([label, groupTags]) => {
    const expanded = filtering || state.watchExpandedTypes.has(label);
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
function statCount(tags, description, play = startPlaylist) {
  if (!tags.length || !play) {
    const zero = document.createElement("span");
    zero.className = tags.length ? "stat-number" : "stat-zero";
    zero.textContent = String(tags.length);
    return zero;
  }
  const button = document.createElement("button");
  button.type = "button";
  button.className = "stat-play";
  button.textContent = tags.length;
  button.title = `Play these ${plural(tags.length, "clip")}`;
  button.setAttribute("aria-label", `${description}: ${tags.length}. Play these clips`);
  button.addEventListener("click", () => play(tags, description));
  return button;
}

// Counts the video's events by type (split by half when Half-time is tagged) and by player.
// Markers (Start of game, Half-time, End of game) only set the boundaries and are never counted.
function renderWatchStats(record) {
  renderStats($("#watchStatsView"), watchEvents(record), record.teamId, startPlaylist);
}

// The stats tables, for Watch (numbers play their clips) and the Tag screen (play = null: plain numbers).
function renderStats(container, all, teamId, play) {
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
  // With opponent moments, each count is shown for Us and for the Opponent.
  const sides = counted.some(isOpponent)
    ? [["Us", (tags) => tags.filter((tag) => !isOpponent(tag))], ["Opponent", (tags) => tags.filter(isOpponent)]]
    : [["", (tags) => tags]];
  const perSide = halfTime === null ? ["Total"] : ["1st half", "2nd half", "Total"];
  const thead = table.createTHead();
  if (sides.length > 1) {
    const groups = thead.insertRow();
    groups.append(document.createElement("th"));
    for (const [side] of sides) {
      const cell = document.createElement("th");
      cell.scope = "colgroup";
      cell.colSpan = perSide.length;
      cell.className = "stats-side";
      cell.textContent = side;
      groups.append(cell);
    }
  }
  const head = thead.insertRow();
  for (const name of ["Event", ...sides.flatMap(() => perSide)]) {
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
    for (const [side, pick] of sides) {
      const mine = pick(tags);
      const about = side ? `${label} (${side})` : label;
      if (halfTime !== null) {
        row.insertCell().append(statCount(inHalf(mine, 1), `${about}, 1st half`, play));
        row.insertCell().append(statCount(inHalf(mine, 2), `${about}, 2nd half`, play));
      }
      row.insertCell().append(statCount(mine, about, play));
    }
  };
  for (const [label, tags] of typeRows) addRow(label, tags);
  addRow("All events", counted, "stats-total");
  tableWrap.append(table);

  // Players: squad members are counted by identity (so spelling and renames don't split them);
  // other names are matched ignoring case and extra spaces. A moment naming two players counts for both.
  const players = new Map();
  const unnamed = [];
  // Players are ours: opponent moments are counted in the table above only.
  for (const tag of counted.filter((item) => !isOpponent(item))) {
    const { ids, others } = tagPlayers(tag, teamId);
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
    top.append(name, statCount(player.tags, player.name, play));
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

  container.replaceChildren(eventsHeading, hint, tableWrap, ...passStats(counted.filter((tag) => !isOpponent(tag)), halfTime, inHalf, play), playersHeading, playerList);
}

// Passing: how many pass sequences, how long they were, and the longer ones to watch back.
function passStats(counted, halfTime, inHalf, play) {
  const sequences = counted.filter((tag) => passCountText(tag));
  if (!sequences.length) return [];
  const heading = document.createElement("h3");
  heading.className = "stats-heading";
  heading.textContent = "Passing";
  const counts = sequences.map((tag) => tag.passCount);
  const total = counts.reduce((sum, count) => sum + count, 0);
  const longest = Math.max(...counts);
  const summary = document.createElement("p");
  summary.className = "stats-hint";
  // Time from one sequence to the next, within each half (the half-time break is not a gap).
  const gapsIn = (tags) => {
    const times = tags.map((tag) => tag.timestampSeconds).sort((first, second) => first - second);
    return times.slice(1).map((time, index) => time - times[index]);
  };
  const average = (values) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null);
  const halves = halfTime === null ? null : [gapsIn(inHalf(sequences, 1)), gapsIn(inHalf(sequences, 2))];
  const gap = average(halves ? halves.flat() : gapsIn(sequences));
  const gapText = gap === null ? ""
    : ` Time between sequences: ${formatTime(gap)} on average${halves ? ` (1st half ${average(halves[0]) === null ? "–" : formatTime(average(halves[0]))}, 2nd half ${average(halves[1]) === null ? "–" : formatTime(average(halves[1]))})` : ""}.`;
  summary.textContent = `${total} passes in ${plural(sequences.length, "sequence")}. Longest: ${longest} passes. Average: ${(total / sequences.length).toFixed(1)}.${gapText} Click a number to play those clips.`;
  const table = document.createElement("table");
  table.className = "stats-table";
  const columns = halfTime === null ? ["Sequences", "Total"] : ["Sequences", "1st half", "2nd half", "Total"];
  const head = table.createTHead().insertRow();
  for (const name of columns) {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = name;
    head.append(cell);
  }
  const body = table.createTBody();
  for (const [label, tags] of [
    ["All pass sequences", sequences],
    ["3 or more passes", sequences.filter((tag) => tag.passCount >= 3)],
    ["5 or more passes", sequences.filter((tag) => tag.passCount >= 5)],
    [`Longest (${longest} passes)`, sequences.filter((tag) => tag.passCount === longest)],
  ]) {
    const row = body.insertRow();
    const name = document.createElement("th");
    name.scope = "row";
    name.textContent = label;
    row.append(name);
    if (halfTime !== null) {
      row.insertCell().append(statCount(inHalf(tags, 1), `${label}, 1st half`, play));
      row.insertCell().append(statCount(inHalf(tags, 2), `${label}, 2nd half`, play));
    }
    row.insertCell().append(statCount(tags, label, play));
  }
  const wrap = document.createElement("div");
  wrap.className = "stats-table-wrap";
  wrap.append(table);
  return [heading, summary, wrap];
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
  // The same link can arrive twice at once (sign-in and an address change); open it only once.
  if (state.openingPlaylistId === id) return;
  state.openingPlaylistId = id;
  state.linkedPlaylistId = id;
  setWatchView("events");
  try {
    await selectWatchVideo(record.id);
  } finally {
    state.openingPlaylistId = "";
  }
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
  document.querySelectorAll(".watch-event, #watchTimelineBar .timeline-tick, #watchTimelinePassBar .timeline-tick").forEach((button) => {
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
  state.clipFilterType = "";
  state.clipFilterPlayer = "";
  state.clipFilterPasses = 0;
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
  if (!record.vimeoUrl) {
    const waiting = document.createElement("div");
    waiting.className = "watch-no-video";
    waiting.textContent = "Video coming soon. Here are the events tagged live; clips play once the video is added.";
    $("#watchVideoFrame").append(waiting);
    notifyWatch(`${record.title} was tagged live and its video isn't ready yet. Its events and stats are below.`);
    return;
  }
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
        const left = `${Math.min(100, Math.max(0, (seconds / state.watchDuration) * 100))}%`;
        $("#watchTimelineNow").style.left = left;
        $("#watchTimelinePassNow").style.left = left;
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
  const retired = retiredEventTypes.find(([value]) => value === tag.eventType);
  if (retired) eventType.add(new Option(`${retired[1]} (no longer offered)`, retired[0]));
  eventType.value = tag.eventType || "";
  eventType.addEventListener("change", () => {
    applyEventType(eventType.value);
    if (eventType.value === "other") customEvent.focus();
  });

  const customWrap = document.createElement("div");
  customWrap.className = "custom-event-wrap";

  const passWrap = document.createElement("label");
  passWrap.className = "pass-count-field";
  const passInput = document.createElement("input");
  passInput.type = "number";
  passInput.min = "1";
  passInput.max = "99";
  passInput.inputMode = "numeric";
  passInput.value = tag.passCount || "";
  passInput.setAttribute("aria-label", `Number of passes in the sequence at ${time}`);
  passInput.addEventListener("input", () => {
    const count = Number(passInput.value);
    updateTag(tag.id, { passCount: Number.isInteger(count) && count > 0 && count < 100 ? count : null });
    refreshRow();
  });
  passWrap.append("Passes ", passInput);

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

  const sideRow = document.createElement("div");
  sideRow.className = "side-row";
  const opponentButton = document.createElement("button");
  opponentButton.type = "button";
  opponentButton.className = "opponent-toggle";
  opponentButton.textContent = "Opponent";
  opponentButton.title = "The other team's moment, e.g. their goal (key X for the last mark)";
  opponentButton.addEventListener("click", () => {
    const current = state.tags.find((item) => item.id === tag.id);
    updateTag(tag.id, { side: isOpponent(current) ? null : "opponent" });
    refreshRow();
    renderTimeline();
  });
  sideRow.append(opponentButton);

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
    passWrap.hidden = current.eventType !== "pass_sequence";
    if (!done) doneButton.disabled = !complete;
    summaryLabel.textContent = complete ? [tagEventLabel(current), passCountText(current)].filter(Boolean).join(" · ") : "Needs a type";
    const { ids, others } = tagPlayers(current, activeTeamId());
    const names = [...(isOpponent(current) ? ["Opponent"] : []), ...ids.map((id) => state.memberById.get(id)).filter(Boolean).map(memberLabel), ...others];
    row.classList.toggle("opponent", isOpponent(current));
    opponentButton.setAttribute("aria-pressed", String(isOpponent(current)));
    opponentButton.setAttribute("aria-label", `${isOpponent(current) ? "Marked as the opponent's" : "Mark as the opponent's"} moment at ${time}`);
    summaryPlayers.textContent = names.length ? names.join(", ") : "";
    summaryPlayers.hidden = !names.length;
    summaryMark.textContent = isDone(current) ? "✓" : (expanded ? "▾" : "▸");
    summaryMain.setAttribute("aria-label", `${time} ${summaryLabel.textContent}${names.length ? `, ${names.join(", ")}` : ""}. ${expanded ? "Close" : "Edit"} this moment`);
  }

  details.append(timeEditor, status, quickTypes, eventType, customWrap, passWrap, sideRow, picker, note, rowActions);
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
  renderPassChain();
  renderPassCleanup();
  $("#emptyTags").hidden = state.tags.length > 0;
  const todo = state.tags.filter((tag) => !isDone(tag));
  const done = state.tags.filter(isDone);
  const sections = [];
  // Only moments still in To do can be selected for editing several at once.
  state.bulkIds = new Set(todo.filter((tag) => state.bulkIds.has(tag.id)).map((tag) => tag.id));
  renderTagViewSwitch();

  if (state.tags.length && (state.tagView === "match" || state.tagView === "stats")) {
    $("#tagList").replaceChildren(state.tagView === "stats" ? tagStatsSection() : matchOrderSection(todo));
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
  $("#tagViewGroups").setAttribute("aria-pressed", String(state.tagView === "groups"));
  $("#tagViewStats").setAttribute("aria-pressed", String(state.tagView === "stats"));
}

// The Stats view of the Tag screen: the same tables as Watch, from this video's moments as they are now.
function tagStatsSection() {
  const section = document.createElement("section");
  section.className = "tag-stats";
  const untyped = state.tags.filter((tag) => !isComplete(tag)).length;
  if (untyped) {
    const note = document.createElement("p");
    note.className = "stats-hint";
    note.textContent = `${plural(untyped, "moment")} without a type ${untyped === 1 ? "isn't" : "aren't"} counted.`;
    section.append(note);
  }
  const body = document.createElement("div");
  body.className = "tag-stats-body";
  renderStats(body, state.tags.filter(isComplete).sort(byTime), activeTeamId(), null);
  section.append(body);
  return section;
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
    // A live second-half kick-off can share Half-time's match time; it still starts the 2nd half.
    if (halfTime !== null && !secondHalf && tag.eventType !== "half_time" && (tag.timestampSeconds > halfTime || tag.liveHalf === 2)) {
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
  const bars = [$("#timelineBar"), $("#timelinePassBar")];
  const show = !!state.activeRecord && state.videoDuration > 0;
  $("#timeline").hidden = !show;
  for (const bar of bars) bar.querySelectorAll(".timeline-tick, .timeline-half").forEach((element) => element.remove());
  if (!show) return;
  const halfTime = state.tags.find((tag) => tag.eventType === "half_time")?.timestampSeconds ?? null;
  $("#timelineHalf").textContent = halfTime === null ? "" : `Half-time ${formatTime(halfTime)}`;
  if (halfTime !== null) {
    for (const bar of bars) {
      const line = document.createElement("div");
      line.className = "timeline-half";
      line.style.left = timelinePercent(halfTime);
      bar.append(line);
    }
  }
  $("#timelinePassRow").hidden = !state.tags.some((tag) => secondTimelineTypes.has(tag.eventType));
  for (const tag of [...state.tags].sort(byTime)) {
    if (markerTypes.has(tag.eventType) || timelineHiddenTypes.has(tag.eventType)) continue;
    const bar = bars[secondTimelineTypes.has(tag.eventType) ? 1 : 0];
    const tick = document.createElement("button");
    tick.type = "button";
    tick.className = "timeline-tick";
    if (!isComplete(tag)) tick.classList.add("needs-type");
    else if (tag.eventType === "goal") tick.classList.add("goal");
    tick.classList.toggle("opponent", isOpponent(tag));
    tick.style.left = timelinePercent(tag.timestampSeconds);
    const label = `${formatTime(tag.timestampSeconds)} ${isComplete(tag) ? tagEventLabel(tag) : "needs a type"}${isOpponent(tag) ? " (opponent)" : ""}`;
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
  const bars = [bar, $("#watchTimelinePassBar")];
  for (const item of bars) item.querySelectorAll(".timeline-tick, .timeline-half").forEach((element) => element.remove());
  if (!show) return;
  const percent = (seconds) => `${Math.min(100, Math.max(0, (seconds / duration) * 100))}%`;
  const tags = watchEvents(record);
  const halfTime = tags.find((tag) => tag.eventType === "half_time")?.timestampSeconds ?? null;
  $("#watchTimelineHalf").textContent = halfTime === null ? "" : `Half-time ${formatTime(halfTime)}`;
  if (halfTime !== null) {
    for (const item of bars) {
      const line = document.createElement("div");
      line.className = "timeline-half";
      line.style.left = percent(halfTime);
      item.append(line);
    }
  }
  $("#watchTimelinePassRow").hidden = !tags.some((tag) => secondTimelineTypes.has(tag.eventType));
  for (const tag of tags) {
    if (markerTypes.has(tag.eventType) || timelineHiddenTypes.has(tag.eventType)) continue;
    const target = bars[secondTimelineTypes.has(tag.eventType) ? 1 : 0];
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
    target.append(tick);
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
  const status = !saved ? "New, not saved yet" : [record.status === "published" ? "Published" : "In progress", state.noVideo ? "No video yet" : ""].filter(Boolean).join(" · ");
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
      const valid = [...new Set(saved.flatMap((value) => replacedQuickTypes[value] ?? [value]))]
        .filter((value) => value && value !== "other" && eventTypes.some(([type]) => type === value));
      if (valid.length) return valid.slice(0, quickKeys.length);
    }
  } catch {
    // Storage unavailable or damaged: use the defaults.
  }
  return [...defaultQuickTypes];
}

function eventTypeName(value) {
  return (eventTypes.find(([type]) => type === value) || retiredEventTypes.find(([type]) => type === value))?.[1] || value;
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
  const passes = passCountText(tag);
  const who = [...(isOpponent(tag) ? ["Opponent"] : []), ...players];
  $("#lastMarkedText").textContent = `Last: ${isComplete(tag) ? tagEventLabel(tag) : "untyped moment"}${passes ? ` (${passes})` : ""} at ${formatTime(tag.timestampSeconds)}${who.length ? ` · ${who.join(", ")}` : ""}`;
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

// ---- Pass chain while tagging a video ----
// P on the first pass marks a Pass sequence (like a quick type, so the mark offset applies); each P
// after that adds a pass; L ends it, and so does marking anything else.
function passChainTag() {
  return state.tags.find((tag) => tag.id === state.passChainId) || null;
}

function renderPassChain() {
  const chain = passChainTag();
  if (!chain) state.passChainId = null;
  $("#passChainButton").hidden = !!chain;
  $("#passChainActive").hidden = !chain;
  if (chain) $("#passChainCount").textContent = chain.passCount;
}

async function passChainPress() {
  const chain = passChainTag();
  if (chain) {
    countVideoPass(1);
    return;
  }
  await markMoment("pass_sequence", { passCount: 1 });
  const tag = state.tags.find((item) => item.id === state.lastMarkedId);
  if (tag?.eventType !== "pass_sequence") return;
  state.passChainId = tag.id;
  renderPassChain();
  notify(`Pass chain started at ${formatTime(tag.timestampSeconds)}. Press P (or +1 pass) for each pass after it, and L (Lost it) when the other team wins the ball.`, "success");
}

function countVideoPass(step) {
  const chain = passChainTag();
  if (!chain) return;
  updateTag(chain.id, { passCount: Math.min(99, Math.max(1, chain.passCount + step)) });
  renderTags();
}

// Ends the chain. One shorter than the minimum (Tagging options) is not kept.
function closeVideoChain() {
  const chain = passChainTag();
  state.passChainId = null;
  if (!chain) return null;
  const min = minPasses();
  if (min && chain.passCount < min) {
    state.tags = state.tags.filter((tag) => tag.id !== chain.id);
    if (state.lastMarkedId === chain.id) state.lastMarkedId = null;
    setDirty();
    renderTags();
    return { chain, dropped: true, min };
  }
  return { chain, dropped: false, min };
}

function endPassChain() {
  const closed = closeVideoChain();
  if (!closed) return;
  renderPassChain();
  const { chain, dropped, min } = closed;
  notify(dropped
    ? `Pass sequence of ${passCountText(chain)} not kept: the minimum is ${min} (Tagging options).`
    : `Pass sequence at ${formatTime(chain.timestampSeconds)}: ${passCountText(chain)}.`, "success");
}

// X: the moment just marked was the opponent's (press again to undo).
function toggleOpponentLast() {
  const tag = state.tags.find((item) => item.id === state.lastMarkedId);
  if (!tag) return;
  updateTag(tag.id, { side: isOpponent(tag) ? null : "opponent" });
  renderTags();
  const updated = state.tags.find((item) => item.id === tag.id);
  notify(`${isComplete(updated) ? tagEventLabel(updated) : "Moment"} at ${formatTime(updated.timestampSeconds)} ${isOpponent(updated) ? "marked as the opponent's" : "is ours again"}.`, "success");
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

function minPasses() {
  try {
    const saved = window.localStorage.getItem(minPassesStorageKey);
    if (saved !== null && minPassesChoices.includes(Number(saved))) return Number(saved);
  } catch {
    // Storage unavailable: use the default.
  }
  return defaultMinPasses;
}

function setMinPasses(value) {
  const number = minPassesChoices.includes(Number(value)) ? Number(value) : defaultMinPasses;
  try {
    window.localStorage.setItem(minPassesStorageKey, String(number));
  } catch {
    // Remembering the choice is a convenience only.
  }
  for (const selector of ["#minPasses", "#liveMinPasses"]) $(selector).value = String(number);
  renderPassCleanup();
}

function typeLeads() {
  const leads = { ...defaultTypeLeads };
  try {
    const saved = JSON.parse(window.localStorage.getItem(typeLeadsStorageKey) || "{}");
    for (const type of Object.keys(leads)) {
      const value = saved?.[type];
      if (Number.isInteger(value) && value >= 0 && value <= 60) leads[type] = value;
    }
  } catch {
    // Damaged or unavailable: the defaults.
  }
  return leads;
}

// Seconds before the tap for this type, or null when the type has no time of its own.
function typeLeadSeconds(eventType) {
  const leads = typeLeads();
  return Object.hasOwn(leads, eventType) ? leads[eventType] : null;
}

function renderTypeLeads() {
  const leads = typeLeads();
  $("#typeLeads").replaceChildren(...Object.keys(defaultTypeLeads).map((type) => {
    const label = document.createElement("label");
    label.className = "type-lead";
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.max = "60";
    input.inputMode = "numeric";
    input.value = String(leads[type]);
    input.dataset.type = type;
    input.setAttribute("aria-label", `Seconds before for ${eventTypeName(type)}`);
    input.addEventListener("change", () => {
      const value = Math.round(Number(input.value));
      const next = { ...typeLeads(), [type]: Number.isFinite(value) ? Math.min(60, Math.max(0, value)) : defaultTypeLeads[type] };
      input.value = String(next[type]);
      try {
        window.localStorage.setItem(typeLeadsStorageKey, JSON.stringify(next));
      } catch {
        // Remembering the choice is a convenience only.
      }
    });
    const name = document.createElement("span");
    name.textContent = eventTypeName(type);
    label.append(name, input, " s");
    return label;
  }));
}

// Tag screen: delete every pass sequence on this video shorter than a chosen number of passes.
function renderPassCleanup() {
  const sequences = state.tags.filter((tag) => tag.eventType === "pass_sequence");
  $("#passCleanup").hidden = !sequences.length;
  if (!sequences.length) return;
  const below = Number($("#passCleanupMin").value) || defaultMinPasses;
  const short = sequences.filter((tag) => (tag.passCount || 0) < below);
  $("#passCleanupCount").textContent = `${plural(short.length, "sequence")} on this video`;
  $("#passCleanupButton").disabled = !short.length;
}

function deleteShortSequences() {
  const below = Number($("#passCleanupMin").value) || defaultMinPasses;
  deleteMoments(state.tags.filter((tag) => tag.eventType === "pass_sequence" && (tag.passCount || 0) < below), `pass sequences under ${below} passes`);
}

function markOffsetSeconds() {
  const value = Number($("#markOffset").value);
  return markOffsetChoices.includes(value) ? value : 0;
}

// Marks a moment at the current time (minus the mark offset). With an event type (a quick-type key or
// button) the moment is already complete, so it goes straight to Done; the "Last marked" bar then takes
// shirt numbers for it.
async function markMoment(eventType = "", extra = {}) {
  if (typeof eventType !== "string") eventType = "";
  if (!state.playerReady || !state.player) return;
  // Marking anything else ends a pass chain.
  closeVideoChain();
  try {
    const offset = typeLeadSeconds(eventType) ?? markOffsetSeconds();
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
      ...extra,
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
  if (state.videoDuration) {
    $("#timelineNow").style.left = timelinePercent(seconds);
    $("#timelinePassNow").style.left = timelinePercent(seconds);
  }
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
  // A live match from Waiting for video gets its first Vimeo link here.
  const attaching = !!record && !record.vimeoUrl;
  setNoVideo(false);
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
  state.passChainId = null;
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
  renderLiveAlign();
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
    renderAlignPreview();
    if (attaching) {
      setDirty();
      notify(`Video attached to ${record.title}. Now line up the live moments under the video: find kick-off, or type the clock shown on screen.${record.status === "published" ? " Then choose Re-publish changes so viewers get the clips." : ""}`, "success");
      return;
    }
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
  // A live match without its video saves its moments with no link; Attach video adds one.
  const vimeoUrl = state.noVideo ? "" : $("#videoUrl").value.trim();
  if (!state.noVideo) {
    const video = parseVimeoUrl(vimeoUrl);
    if (video.id !== state.video.id || video.hash !== state.video.hash) {
      throw new Error("The Vimeo link changed. Open that link before saving its moments.");
    }
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
  if (!state.activeRecord || !(state.playerReady || state.noVideo) || state.isSaving) return;
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
      // The heading's status ("New, not saved yet") depends on the library list just refreshed.
      renderVideoHeader();
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

function setNoVideo(on) {
  state.noVideo = on;
  $("#videoCard").classList.toggle("no-video", on);
  $("#tagsCard").classList.toggle("no-video", on);
  $("#noVideoBox").hidden = !on;
  if (!on) $("#attachUrl").value = "";
}

// A live match without its video opens like any video: its moments can be typed, given players, ticked
// Done, deleted and saved (or published). They sit at match time. Attach video brings the video in later.
async function openWithoutVideo(record) {
  await flushAutosave();
  if (!confirmDiscard()) return;
  if (state.player) {
    try {
      await state.player.destroy();
    } catch (error) {
      console.error("Could not close the previous Vimeo player:", error);
    }
  }
  state.video = null;
  state.player = null;
  state.videoDuration = 0;
  exitStage();
  $("#videoName").value = record.title;
  $("#videoUrl").value = "";
  if (state.teamsAvailable) {
    renderTeamOptions();
    $("#videoTeam").value = record.teamId && state.teams.some((team) => team.id === record.teamId)
      ? record.teamId
      : (state.teams.length === 1 ? state.teams[0].id : "");
  }
  const teamId = activeTeamId();
  state.tags = withMatchClock((record.tags || []).map((tag) => withPlayers(normalizeTag(tag), teamId))).sort(byTime);
  state.activeRecord = record;
  state.isDirty = false;
  cancelAutosave();
  state.lastMarkedId = null;
  state.passChainId = null;
  state.numberBuffer = "";
  state.bulkIds = new Set();
  $("#videoFrame").replaceChildren();
  setNoVideo(true);
  setPlayerReady(false);
  setPlayingLabel(false);
  updatePlayerClock(0);
  $("#saveHint").textContent = `Saved ${record.status === "published" ? "as published" : "in progress"}`;
  $("#tagPanel").classList.add("has-video");
  $("#videoCard").hidden = false;
  $("#tagsCard").hidden = false;
  renderTags();
  renderLiveAlign();
  renderLibrary();
  renderVideoHeader();
  notify(`Opened ${record.title}. Its live moments are at match time: give them types and players, tick them Done and save. When the video is ready, paste its Vimeo link in the No video yet box.`, "success");
}

// Brings the video in, carrying the moments as they are now (including unsaved edits).
async function attachVideo() {
  if (!state.noVideo || !state.activeRecord) return;
  const url = $("#attachUrl").value.trim();
  try {
    parseVimeoUrl(url);
  } catch (error) {
    notify(error.message, "error");
    $("#attachUrl").focus();
    return;
  }
  await flushAutosave();
  const record = { ...state.activeRecord, title: $("#videoName").value.trim() || state.activeRecord.title, vimeoUrl: "", tags: state.tags.map(serializeTag) };
  state.isDirty = false;
  $("#videoUrl").value = url;
  await openVideo(url, record);
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
  setNoVideo(false);
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
  // A live match stays in this browser's storage and comes back at the next sign-in.
  clearInterval(state.liveTicker);
  clearTimeout(state.liveSyncTimer);
  state.liveTicker = null;
  state.live = null;
  setNoVideo(false);
  state.users = [];
  state.editingUserId = "";
  $("#usersPanel").hidden = true;
  releaseScreen();
  document.body.classList.remove("live-open");
  $("#livePanel").hidden = true;
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
  if (arrivedFromInvite && !state.invitePrompted) {
    state.invitePrompted = true;
    openPasswordDialog(true);
  }
  if (state.role === "admin" && restoreLive()) {
    renderLibrary();
    if (liveRunning()) openLive();
  }
  await openLinkedPlaylist();
}

function openPasswordDialog(welcome = false) {
  const dialog = $("#passwordDialog");
  $("#passwordHeading").textContent = welcome ? "Welcome to Touchline. Choose your password" : "Choose a new password";
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
$("#librarySearch").addEventListener("input", () => {
  state.libraryQuery = $("#librarySearch").value;
  renderLibrary();
});
$("#librarySearch").addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  $("#librarySearch").value = "";
  state.libraryQuery = "";
  renderLibrary();
});
$("#libraryTeamFilter").addEventListener("change", () => {
  state.libraryTeam = $("#libraryTeamFilter").value;
  renderLibrary();
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
  const record = currentWatchRecord();
  if (record) renderWatchEvents(record);
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
  // With a filter on, this ticks (or unticks) only the events shown; other ticks are kept.
  const ids = watchEvents(record).filter((tag) => matchesClipFilter(tag, record.teamId)).map((tag) => tag.id);
  if (ids.every((id) => state.watchSelectedIds.has(id))) for (const id of ids) state.watchSelectedIds.delete(id);
  else for (const id of ids) state.watchSelectedIds.add(id);
  renderWatchEvents(record);
});
$("#clipFilterType").addEventListener("change", () => {
  state.clipFilterType = $("#clipFilterType").value;
  const record = currentWatchRecord();
  if (record) renderWatchEvents(record);
});
$("#clipFilterPasses").addEventListener("change", () => {
  state.clipFilterPasses = Number($("#clipFilterPasses").value) || 0;
  const record = currentWatchRecord();
  if (record) renderWatchEvents(record);
});
$("#clipFilterPlayer").addEventListener("change", () => {
  state.clipFilterPlayer = $("#clipFilterPlayer").value;
  const record = currentWatchRecord();
  if (record) renderWatchEvents(record);
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
  // Nothing saved yet reads as null, and Number(null) is 0: keep the page's default (3 s) in that case.
  if (savedOffset !== null && markOffsetChoices.includes(Number(savedOffset))) $("#markOffset").value = savedOffset;
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
setMinPasses(minPasses());
renderTypeLeads();
for (const selector of ["#minPasses", "#liveMinPasses"]) {
  $(selector).addEventListener("change", () => setMinPasses($(selector).value));
}
$("#passCleanupMin").addEventListener("change", renderPassCleanup);
$("#passCleanupButton").addEventListener("click", deleteShortSequences);
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
  if (["match", "groups", "stats"].includes(savedView)) state.tagView = savedView;
} catch {
  // Default: Match order.
}
$("#tagViewMatch").addEventListener("click", () => setTagView("match"));
$("#tagViewGroups").addEventListener("click", () => setTagView("groups"));
$("#tagViewStats").addEventListener("click", () => setTagView("stats"));
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
for (const selector of ["#watchTimelineBar", "#watchTimelinePassBar"]) {
  $(selector).addEventListener("click", (event) => {
    if (!state.watchPlayer || !state.watchDuration || !state.watchReady) return;
    const box = $(selector).getBoundingClientRect();
    const seconds = ((event.clientX - box.left) / box.width) * state.watchDuration;
    state.watchPlayer.setCurrentTime(Math.max(0, Math.min(state.watchDuration, seconds))).catch(() => {});
  });
}
for (const selector of ["#timelineBar", "#timelinePassBar"]) {
  $(selector).addEventListener("mousedown", (event) => event.preventDefault());
  $(selector).addEventListener("click", (event) => {
    if (!state.player || !state.videoDuration) return;
    const box = $(selector).getBoundingClientRect();
    const seconds = ((event.clientX - box.left) / box.width) * state.videoDuration;
    state.player.setCurrentTime(Math.max(0, Math.min(state.videoDuration, seconds))).catch(() => {});
  });
}
$("#lastMarkedUndo").addEventListener("mousedown", (event) => event.preventDefault());
$("#lastMarkedUndo").addEventListener("click", undoLastMark);
for (const selector of ["#passChainButton", "#passChainPlus", "#passChainMinus", "#passChainStop"]) {
  // Keep keyboard focus where it was, so P and L keep working after a click.
  $(selector).addEventListener("mousedown", (event) => event.preventDefault());
}
$("#passChainButton").addEventListener("click", passChainPress);
$("#passChainPlus").addEventListener("click", () => countVideoPass(1));
$("#passChainMinus").addEventListener("click", () => countVideoPass(-1));
$("#passChainStop").addEventListener("click", endPassChain);

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
    x: () => toggleOpponentLast(),
    X: () => toggleOpponentLast(),
    p: () => passChainPress(),
    P: () => passChainPress(),
    l: () => endPassChain(),
    L: () => endPassChain(),
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

// ---- Users (admins) ----
// Accounts are created and removed by the admin-users Edge Function, which holds Supabase's
// service-role key on the server; the page only sends the admin's own sign-in with each request.

function notifyUsers(message, kind = "") {
  showNotice("#usersNotice", message, kind);
}

function signInAddress() {
  return `${window.location.origin}${window.location.pathname}`;
}

async function callUsersFunction(body) {
  const { data, error } = await supabase.functions.invoke("admin-users", { body });
  if (error) {
    let message = error.message || "The request failed.";
    const status = error.context?.status;
    try {
      const details = await error.context?.json?.();
      if (details?.error) message = details.error;
    } catch {
      // Not JSON: keep the general message.
    }
    const failure = new Error(message);
    // No function deployed (or not reachable at all) means the one-time setup is missing.
    failure.unavailable = status === 404 || !error.context || /failed to send a request/i.test(error.message || "");
    throw failure;
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

async function loadUsers() {
  if (state.role !== "admin" || !supabase) return;
  notifyUsers("Loading users…");
  try {
    const data = await callUsersFunction({ action: "list" });
    state.users = data.users || [];
    state.usersAvailable = true;
    notifyUsers("");
  } catch (error) {
    if (error.unavailable) {
      state.usersAvailable = false;
      $("#usersUnavailableDetail").textContent = `Details: ${error.message}`;
      notifyUsers("");
    } else {
      notifyUsers(`Could not load users: ${friendlyError(error)}`, "error");
    }
  }
  renderUsers();
}

function userStatus(user) {
  if (!user.role) return { text: "No access", pending: true };
  if (user.confirmedAt || user.lastSignInAt) return { text: "Active", pending: false };
  return { text: "Invited, not signed in yet", pending: true };
}

function shortDate(value) {
  return value ? new Date(value).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "Never";
}

function renderUsers() {
  $("#usersUnavailable").hidden = state.usersAvailable;
  $("#usersContent").hidden = !state.usersAvailable;
  if (!state.usersAvailable) return;
  const me = state.sessionUserId;
  const query = state.usersQuery.trim().toLowerCase();
  const sorted = [...state.users].sort((first, second) =>
    (first.id === me ? -1 : second.id === me ? 1 : 0)
    || ((first.role === "admin" ? 0 : 1) - (second.role === "admin" ? 0 : 1))
    || first.email.localeCompare(second.email));
  const shown = sorted.filter((user) => !query || user.email.toLowerCase().includes(query));
  const admins = state.users.filter((user) => user.role === "admin").length;
  const viewers = state.users.filter((user) => user.role === "viewer").length;
  $("#usersSummary").textContent = `${plural(state.users.length, "person")
    .replace("persons", "people")} · ${plural(admins, "admin")} · ${plural(viewers, "viewer")}`;

  const head = document.createElement("div");
  head.className = "user-row user-head";
  head.setAttribute("role", "row");
  for (const name of ["EMAIL", "ROLE", "STATUS", "LAST SIGNED IN", ""]) {
    const cell = document.createElement("span");
    cell.setAttribute("role", "columnheader");
    cell.textContent = name;
    head.append(cell);
  }
  const rows = shown.map((user) => {
    const row = document.createElement("div");
    row.className = "user-row";
    row.setAttribute("role", "row");
    row.dataset.userId = user.id;
    const email = document.createElement("span");
    email.className = "user-email";
    email.setAttribute("role", "cell");
    email.title = user.email;
    email.append(user.email);
    if (user.id === me) {
      const you = document.createElement("small");
      you.textContent = " (you)";
      email.append(you);
    }
    const role = document.createElement("span");
    role.className = `user-role ${user.role || "none"}`;
    role.setAttribute("role", "cell");
    role.textContent = user.role === "admin" ? "Admin" : user.role === "viewer" ? "Viewer" : "None";
    const statusInfo = userStatus(user);
    const status = document.createElement("span");
    status.className = "user-status";
    status.classList.toggle("pending", statusInfo.pending);
    status.setAttribute("role", "cell");
    status.textContent = statusInfo.text;
    const when = document.createElement("span");
    when.className = "user-when";
    when.setAttribute("role", "cell");
    when.textContent = shortDate(user.lastSignInAt);
    const actions = document.createElement("span");
    actions.className = "user-actions";
    actions.setAttribute("role", "cell");
    if (user.id === me) {
      const note = document.createElement("span");
      note.className = "form-hint";
      note.textContent = "You can't remove yourself";
      actions.append(note);
    } else {
      if (user.role && !user.confirmedAt && !user.lastSignInAt) {
        const resend = document.createElement("button");
        resend.type = "button";
        resend.className = "player-button";
        resend.textContent = "Resend invite";
        resend.setAttribute("aria-label", `Resend the invite to ${user.email}`);
        resend.addEventListener("click", () => resendInvite(user, resend));
        actions.append(resend);
      }
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "player-button";
      edit.textContent = "Edit";
      edit.setAttribute("aria-label", `Edit ${user.email}`);
      edit.addEventListener("click", () => openUserDialog(user.id));
      actions.append(edit);
    }
    row.append(email, role, status, when, actions);
    return row;
  });
  if (!rows.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = query ? "No users match that search." : "No users yet.";
    $("#usersList").replaceChildren(head, empty);
    return;
  }
  $("#usersList").replaceChildren(head, ...rows);
}

async function inviteUser(event) {
  event.preventDefault();
  const email = $("#inviteEmail").value.trim();
  const role = $("#inviteRole").value;
  if (!$("#inviteEmail").checkValidity() || !email) {
    notifyUsers("Enter a valid email address.", "error");
    $("#inviteEmail").focus();
    return;
  }
  const button = $("#inviteButton");
  button.disabled = true;
  notifyUsers(`Sending an invite to ${email}…`);
  try {
    const data = await callUsersFunction({ action: "invite", email, role, redirectTo: signInAddress() });
    state.users = [data.user, ...state.users.filter((user) => user.id !== data.user.id)];
    $("#inviteEmail").value = "";
    renderUsers();
    notifyUsers(`Invite sent to ${email} as ${role === "admin" ? "an admin" : "a viewer"}. They'll get an email with a link to choose their password.`, "success");
  } catch (error) {
    notifyUsers(`Could not invite ${email}: ${friendlyError(error)}`, "error");
  } finally {
    button.disabled = false;
  }
}

async function resendInvite(user, button) {
  button.disabled = true;
  try {
    await callUsersFunction({ action: "resend", userId: user.id, redirectTo: signInAddress() });
    notifyUsers(`Invite sent again to ${user.email}.`, "success");
  } catch (error) {
    notifyUsers(`Could not resend the invite to ${user.email}: ${friendlyError(error)}`, "error");
  } finally {
    button.disabled = false;
  }
}

function editingUser() {
  return state.users.find((user) => user.id === state.editingUserId) || null;
}

function openUserDialog(userId) {
  const user = state.users.find((item) => item.id === userId);
  if (!user) return;
  state.editingUserId = userId;
  $("#userDialogEmail").textContent = user.email;
  $("#userDialogDetails").textContent = `Joined ${shortDate(user.createdAt)} · last signed in ${shortDate(user.lastSignInAt)}`;
  for (const input of document.querySelectorAll('input[name="userRole"]')) input.checked = input.value === user.role;
  $("#userDialogNotice").textContent = "";
  const dialog = $("#userDialog");
  if (!dialog.open) dialog.showModal();
}

function closeUserDialog() {
  state.editingUserId = "";
  $("#userDialog").close();
}

async function saveUserRole(event) {
  event.preventDefault();
  const user = editingUser();
  if (!user) return;
  const role = document.querySelector('input[name="userRole"]:checked')?.value;
  if (!role) {
    $("#userDialogNotice").textContent = "Choose Admin or Viewer.";
    return;
  }
  if (role === user.role) {
    closeUserDialog();
    return;
  }
  const button = $("#userSaveButton");
  button.disabled = true;
  try {
    const data = await callUsersFunction({ action: "setRole", userId: user.id, role });
    state.users = state.users.map((item) => (item.id === user.id ? data.user : item));
    closeUserDialog();
    renderUsers();
    notifyUsers(`${user.email} is now ${role === "admin" ? "an admin" : "a viewer"}.`, "success");
  } catch (error) {
    $("#userDialogNotice").textContent = friendlyError(error);
  } finally {
    button.disabled = false;
  }
}

async function sendUserReset() {
  const user = editingUser();
  if (!user) return;
  const button = $("#userResetButton");
  button.disabled = true;
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, { redirectTo: signInAddress() });
    if (error) throw error;
    closeUserDialog();
    notifyUsers(`A password reset email is on its way to ${user.email}.`, "success");
  } catch (error) {
    $("#userDialogNotice").textContent = `Could not send the reset email: ${friendlyError(error)}`;
  } finally {
    button.disabled = false;
  }
}

async function removeUser() {
  const user = editingUser();
  if (!user) return;
  if (!window.confirm(`Remove ${user.email}? They are signed out and can't sign in again unless you invite them. Videos, tags and playlists are not affected.`)) return;
  const button = $("#userRemoveButton");
  button.disabled = true;
  try {
    await callUsersFunction({ action: "remove", userId: user.id });
    state.users = state.users.filter((item) => item.id !== user.id);
    closeUserDialog();
    renderUsers();
    notifyUsers(`${user.email} was removed.`, "success");
  } catch (error) {
    $("#userDialogNotice").textContent = friendlyError(error);
  } finally {
    button.disabled = false;
  }
}

$("#inviteForm").addEventListener("submit", inviteUser);
$("#userSearch").addEventListener("input", () => {
  state.usersQuery = $("#userSearch").value;
  renderUsers();
});
$("#reloadUsersButton").addEventListener("click", loadUsers);
$("#userForm").addEventListener("submit", saveUserRole);
$("#userCancelButton").addEventListener("click", closeUserDialog);
$("#userResetButton").addEventListener("click", sendUserReset);
$("#userRemoveButton").addEventListener("click", removeUser);

// ---- Live mode ----
// Tag a match on the sideline as it happens, then attach the video later. Each live moment keeps the
// phone's time of day (liveAt) and its half (liveHalf); its timestampSeconds starts as time since kick-off
// and is recomputed when the admin lines the moments up with the uploaded video. The match lives in this
// browser's storage first, so a lost signal never loses a tag, and is sent to the library whenever it can be.
const liveStorageKey = "touchline.liveMatch";
const liveSyncDelayMs = 1500;
const liveRetryMs = 10000;
// The phone's clock, kept in one place so tests can control it.
const liveClock = { now: () => Date.now() };

function liveRunning() {
  return !!state.live && !state.live.endedAt;
}

function saveLiveLocal() {
  try {
    if (state.live) window.localStorage.setItem(liveStorageKey, JSON.stringify(state.live));
    else window.localStorage.removeItem(liveStorageKey);
  } catch (error) {
    console.warn("Could not keep the live match on this device:", error);
  }
}

function loadLiveLocal() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(liveStorageKey) || "null");
    if (saved && typeof saved.id === "string" && typeof saved.kickoffAt === "number" && Array.isArray(saved.tags)) {
      return { unsent: [], ...saved };
    }
  } catch {
    // Damaged or unavailable storage: nothing to resume.
  }
  return null;
}

// Match time for a moment: the first half counts from kick-off; the second half carries on from the
// first half's length, as a referee's watch would.
function liveMatchSeconds(at, live = state.live) {
  if (live.secondHalfAt && at >= live.secondHalfAt) {
    return (live.halfTimeAt - live.kickoffAt) / 1000 + (at - live.secondHalfAt) / 1000;
  }
  return (at - live.kickoffAt) / 1000;
}

// The match's kick-off, half-time and restart times, read back from its moments.
function liveTimes(tags) {
  const kickoff = liveAnchor(tags, "kickoff");
  if (!kickoff) return null;
  const restart = liveAnchor(tags, "second_half");
  const half = tags.find((tag) => tag.eventType === "half_time" && typeof tag.liveAt === "number");
  return { kickoffAt: kickoff.liveAt, halfTimeAt: half?.liveAt ?? restart?.liveAt ?? null, secondHalfAt: restart?.liveAt ?? null };
}

// Live moments not yet lined up with a video sit at their match time (the half-time break left out).
function withMatchClock(tags) {
  const times = liveTimes(tags);
  if (!times) return tags;
  return tags.map((tag) => (typeof tag.liveAt === "number"
    ? { ...tag, timestampSeconds: Math.max(0, Math.round(liveMatchSeconds(tag.liveAt, times) * 10) / 10) }
    : tag));
}

// The time a live moment is saved at: the tap, less this type's seconds before (never before kick-off,
// or before the second-half kick-off once the second half has started).
function liveTimeFor(tapAt, eventType) {
  const live = state.live;
  const lead = typeLeadSeconds(eventType) ?? 0;
  return Math.max(live.secondHalfAt ?? live.kickoffAt, tapAt - lead * 1000);
}

function liveTag(eventType, extra = {}) {
  const tapAt = liveClock.now();
  const live = state.live;
  const at = extra.liveAnchor || markerTypes.has(eventType) ? tapAt : liveTimeFor(tapAt, eventType);
  const tag = {
    id: crypto.randomUUID(),
    timestampSeconds: Math.max(0, Math.round(liveMatchSeconds(at) * 10) / 10),
    eventType,
    customEventType: "",
    playerIds: [],
    otherPlayers: "",
    playerNames: "",
    note: "",
    done: false,
    liveAt: at,
    liveTapAt: tapAt,
    liveHalf: live.secondHalfAt ? 2 : 1,
    ...extra,
  };
  tag.done = isComplete(tag);
  return tag;
}

function liveChanged(ids) {
  const live = state.live;
  live.unsent = [...new Set([...(live.unsent || []), ...ids])];
  saveLiveLocal();
  scheduleLiveSync();
  renderLive();
}

function addLiveTag(tag, { last = true } = {}) {
  state.live.tags.push(tag);
  if (last) state.live.lastId = tag.id;
  liveChanged([tag.id]);
  return tag;
}

function scheduleLiveSync(delay = liveSyncDelayMs) {
  clearTimeout(state.liveSyncTimer);
  state.liveSyncTimer = setTimeout(syncLive, delay);
}

function liveRow(live) {
  return {
    name: live.title,
    tags: live.tags.map(serializeTag),
    updated_at: new Date().toISOString(),
    ...(state.teamsAvailable ? { team_id: live.teamId || null } : {}),
  };
}

// Sends the whole live match to the library. The first send creates the video (with no Vimeo link yet);
// later sends only update its name, team and moments, so they never undo an attached video link.
async function syncLive() {
  clearTimeout(state.liveSyncTimer);
  state.liveSyncTimer = null;
  const live = state.live;
  if (!live || !supabase || state.role !== "admin") return;
  if (live.inserted && !live.unsent.length) return;
  if (state.liveSyncing) {
    state.liveSyncAgain = true;
    return;
  }
  const sending = new Set(live.unsent);
  state.liveSyncing = true;
  renderLiveSync();
  try {
    const row = liveRow(live);
    const { data, error } = live.inserted
      ? await supabase.from("videos").update(row).eq("id", live.id).select("*").maybeSingle()
      : await supabase.from("videos").upsert({ id: live.id, vimeo_url: "", status: "in_progress", published_at: null, ...row }, { onConflict: "id" }).select("*").single();
    if (error) throw error;
    if (!data) throw new Error("This live match is no longer in the library.");
    live.inserted = true;
    live.unsent = live.unsent.filter((id) => !sending.has(id));
    live.failed = false;
    const saved = mapVideoRow(data);
    state.records = [saved, ...state.records.filter((record) => record.id !== saved.id)];
    if (live.endedAt && !live.unsent.length) {
      // Everything is in the library: this device no longer needs its copy.
      try {
        window.localStorage.removeItem(liveStorageKey);
      } catch {
        // Nothing to clear.
      }
    } else {
      saveLiveLocal();
    }
    renderLibrary();
  } catch (error) {
    console.warn("Live match not sent yet; it is kept on this device:", error);
    live.failed = true;
    saveLiveLocal();
    if (state.live === live) scheduleLiveSync(liveRetryMs);
  } finally {
    state.liveSyncing = false;
    if (state.liveSyncAgain) {
      state.liveSyncAgain = false;
      if (state.live === live && live.unsent.length && !live.failed) scheduleLiveSync(0);
    }
    renderLive();
  }
}

function renderLiveSync() {
  const live = state.live;
  const sync = $("#liveSync");
  if (!live) {
    sync.textContent = "";
    return;
  }
  const waiting = (live.unsent || []).length;
  const offline = live.failed || window.navigator.onLine === false;
  sync.className = "live-sync";
  if (!waiting && live.inserted) {
    sync.textContent = "✓ Everything is saved to the library";
    sync.classList.add("ok");
  } else if (offline) {
    sync.textContent = `No signal: ${plural(waiting, "change")} saved on this phone, sent when back online`;
    sync.classList.add("waiting");
  } else {
    sync.textContent = "Sending…";
  }
}

function liveLastTag() {
  return state.live?.tags.find((tag) => tag.id === state.live.lastId) || null;
}

function liveClockSeconds() {
  const live = state.live;
  const now = liveClock.now();
  if (live.endedAt) return liveMatchSeconds(live.endedAt);
  if (live.halfTimeAt && !live.secondHalfAt) return (live.halfTimeAt - live.kickoffAt) / 1000;
  return liveMatchSeconds(now);
}

function renderLiveClock() {
  const live = state.live;
  if (!live || live.endedAt) return;
  const moments = live.tags.filter((tag) => !markerTypes.has(tag.eventType) && !tag.liveAnchor).length;
  const phase = live.secondHalfAt ? "2nd half" : live.halfTimeAt ? "Half-time" : "1st half";
  $("#liveClock").textContent = formatTime(liveClockSeconds());
  $("#livePhase").textContent = `${phase} · ${plural(moments, "moment")}`;
}

function liveTypeButton(label, hint, onClick, className = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `live-type ${className}`.trim();
  const small = document.createElement("small");
  small.textContent = hint;
  button.append(label, small);
  button.addEventListener("click", onClick);
  return button;
}

function renderLive() {
  const live = state.live;
  const running = liveRunning();
  $("#liveSetup").hidden = !!live;
  $("#liveRun").hidden = !running;
  $("#liveDone").hidden = !live?.endedAt;
  $("#liveBadge").textContent = running ? "● LIVE" : "LIVE MODE";
  $("#liveBadge").classList.toggle("on", running);
  renderLiveResume();
  if (!live) {
    renderLiveSetup();
    return;
  }
  renderLiveSync();
  if (live.endedAt) {
    const waiting = (live.unsent || []).length;
    const moments = live.tags.filter((tag) => !markerTypes.has(tag.eventType) && !tag.liveAnchor).length;
    $("#liveDoneTitle").textContent = live.title;
    $("#liveDoneText").textContent = waiting
      ? `${plural(moments, "moment")} tagged. ${plural(waiting, "change")} still waiting to send: keep this page open until you have signal.`
      : `${plural(moments, "moment")} saved to the library under Waiting for video. When the video is uploaded, open the match there and paste its Vimeo link.`;
    $("#liveDoneButton").disabled = waiting > 0;
    return;
  }
  $("#liveTitle").textContent = live.title;
  renderLiveClock();
  const last = liveLastTag();
  $("#liveTypes").replaceChildren(
    ...state.quickTypes.map((value) => {
      const button = liveTypeButton(eventTypeName(value), "", () => liveMark(value));
      button.querySelector("small").remove();
      button.classList.toggle("on", last?.eventType === value && !last.customEventType);
      return button;
    }),
    liveTypeButton("Moment", "type later", () => liveMark(""), "untyped"),
    liveTypeButton("More types…", `search all ${pickableTypes().length}`, liveMoreTypes, "more"),
  );
  const players = teamPlayers(live.teamId);
  const opponent = document.createElement("button");
  opponent.type = "button";
  opponent.className = "live-player live-opponent";
  opponent.textContent = "Opponent";
  opponent.disabled = !last;
  opponent.classList.toggle("on", isOpponent(last));
  opponent.setAttribute("aria-pressed", String(isOpponent(last)));
  opponent.setAttribute("aria-label", "The last event was the opponent's");
  opponent.addEventListener("click", liveToggleOpponent);
  $("#livePlayers").replaceChildren(opponent, ...players.map((player) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "live-player";
    const picked = !!last && (last.playerIds || []).includes(player.id);
    button.classList.toggle("on", picked);
    button.setAttribute("aria-pressed", String(picked));
    button.disabled = !last;
    button.textContent = player.number === null || player.number === undefined ? player.name.split(" ")[0] : String(player.number);
    button.title = memberLabel(player);
    button.setAttribute("aria-label", `${memberLabel(player)} on the last event`);
    button.addEventListener("click", () => liveTogglePlayer(player.id));
    return button;
  }));
  $("#liveLast").hidden = !last;
  if (last) {
    const names = (last.playerIds || []).map((id) => state.memberById.get(id)).filter(Boolean).map(memberLabel);
    $("#liveLastTime").textContent = `LAST · ${formatTime(liveMatchSeconds(last.liveAt))}`;
    $("#liveLastText").textContent = [isComplete(last) ? tagEventLabel(last) : "Moment (type later)", passCountText(last), isOpponent(last) ? "Opponent" : "", ...names].filter(Boolean).join(" · ");
  }
  const chain = live.tags.find((tag) => tag.id === live.chainId);
  $("#livePassStart").hidden = !!chain;
  $("#livePassActive").hidden = !chain;
  if (chain) $("#livePassCount").textContent = chain.passCount;
  const atHalfTime = !!live.halfTimeAt && !live.secondHalfAt;
  $("#liveHalfButton").hidden = !!live.secondHalfAt;
  $("#liveHalfButton").textContent = atHalfTime ? "▶ Start 2nd half" : "⏸ Half-time";
}

function renderLiveSetup() {
  const field = $("#liveTeamField");
  field.hidden = !state.teamsAvailable || !state.teams.length;
  const select = $("#liveTeam");
  const current = select.value;
  select.replaceChildren(new Option("Choose the team…", ""), ...state.teams.map((team) => new Option(team.name, team.id)));
  select.value = state.teams.some((team) => team.id === current) ? current : (state.teams.length === 1 ? state.teams[0].id : "");
  if (!$("#liveName").value) {
    $("#liveName").placeholder = `e.g. ${state.teams[0]?.name || "Our team"} vs Rivals — ${new Date().toLocaleDateString([], { month: "long", day: "numeric" })}`;
  }
}

function renderLiveResume() {
  const live = state.live;
  $("#liveResume").hidden = !live;
  if (!live) return;
  const waiting = (live.unsent || []).length;
  $("#liveResumeText").textContent = live.endedAt
    ? `"${live.title}" ended. ${plural(waiting, "change")} still waiting to send.`
    : `Live match running: "${live.title}"`;
  $("#liveResumeButton").textContent = live.endedAt ? "See the match" : "Back to the match";
}

function notifyLive(message, kind = "") {
  showNotice("#liveNotice", message, kind);
}

function openLive() {
  if (state.role !== "admin") return;
  setTab("live");
  renderLive();
  if (liveRunning()) keepScreenOn();
}

function closeLive() {
  setTab("tag");
  renderLibrary();
}

async function keepScreenOn() {
  if (!liveRunning() || state.wakeLock || !window.navigator.wakeLock) return;
  try {
    state.wakeLock = await window.navigator.wakeLock.request("screen");
    state.wakeLock.addEventListener?.("release", () => { state.wakeLock = null; });
  } catch (error) {
    console.warn("The screen may turn off during the match:", error);
  }
}

function releaseScreen() {
  state.wakeLock?.release?.().catch(() => {});
  state.wakeLock = null;
}

function startLiveMatch(event) {
  event?.preventDefault();
  if (state.role !== "admin" || liveRunning()) return;
  const title = $("#liveName").value.trim();
  if (!title) {
    notifyLive("Enter a name for this match.", "error");
    $("#liveName").focus();
    return;
  }
  const teamId = state.teamsAvailable ? ($("#liveTeam").value || null) : null;
  if (state.teamsAvailable && state.teams.length && !teamId) {
    notifyLive("Choose the team for this match.", "error");
    $("#liveTeam").focus();
    return;
  }
  const kickoffAt = liveClock.now();
  state.live = { id: crypto.randomUUID(), title, teamId, kickoffAt, halfTimeAt: null, secondHalfAt: null, endedAt: null, tags: [], lastId: null, unsent: [], inserted: false, failed: false };
  addLiveTag(liveTag("start_of_game", { liveAnchor: "kickoff" }), { last: false });
  clearInterval(state.liveTicker);
  state.liveTicker = setInterval(renderLiveClock, 1000);
  keepScreenOn();
  notifyLive("Match started. Tap what happens: the time is saved the moment you tap.", "success");
}

function liveMark(eventType) {
  if (!liveRunning()) return null;
  // Anything else happening ends a pass chain.
  closeLiveChain();
  const tag = addLiveTag(liveTag(eventType));
  notifyLive(`${isComplete(tag) ? tagEventLabel(tag) : "Moment"} at ${formatTime(liveMatchSeconds(tag.liveAt))}.`, "success");
  return tag;
}

// Pass chain: the first tap saves a Pass sequence at that moment; each tap adds a pass; Lost it (or any
// other event) ends it.
function liveStartPasses() {
  if (!liveRunning()) return;
  const tag = liveMark("pass_sequence");
  tag.passCount = 1;
  state.live.chainId = tag.id;
  liveChanged([tag.id]);
}

function liveCountPass(step) {
  const chain = state.live?.tags.find((tag) => tag.id === state.live.chainId);
  if (!chain) return;
  chain.passCount = Math.min(99, Math.max(1, chain.passCount + step));
  liveChanged([chain.id]);
}

// Ends the chain. One shorter than the minimum is not kept.
function closeLiveChain() {
  const live = state.live;
  if (!live) return null;
  const chain = live.tags.find((tag) => tag.id === live.chainId);
  live.chainId = null;
  if (!chain) return null;
  const min = minPasses();
  if (min && chain.passCount < min) {
    live.tags = live.tags.filter((tag) => tag.id !== chain.id);
    if (live.lastId === chain.id) live.lastId = null;
    liveChanged([chain.id]);
    return { chain, dropped: true, min };
  }
  return { chain, dropped: false, min };
}

function liveStopPasses() {
  const closed = closeLiveChain();
  if (!closed) return;
  renderLive();
  const { chain, dropped, min } = closed;
  notifyLive(dropped ? `Pass sequence of ${passCountText(chain)} not kept (minimum ${min}).` : `Pass sequence: ${passCountText(chain)}.`, "success");
}

function liveToggleOpponent() {
  const tag = liveLastTag();
  if (!tag) return;
  tag.side = isOpponent(tag) ? null : "opponent";
  liveChanged([tag.id]);
}

function liveTogglePlayer(playerId) {
  const tag = liveLastTag();
  if (!tag) return;
  const ids = tag.playerIds || [];
  tag.playerIds = ids.includes(playerId) ? ids.filter((id) => id !== playerId) : [...ids, playerId];
  liveChanged([tag.id]);
}

function liveUndo() {
  const tag = liveLastTag();
  if (!tag) return;
  state.live.tags = state.live.tags.filter((item) => item.id !== tag.id);
  state.live.lastId = null;
  if (state.live.chainId === tag.id) state.live.chainId = null;
  liveChanged([tag.id]);
  notifyLive(`Removed the ${isComplete(tag) ? tagEventLabel(tag) : "moment"} at ${formatTime(liveMatchSeconds(tag.liveAt))}.`);
}

function liveHalfTime() {
  const live = state.live;
  if (!liveRunning() || live.secondHalfAt) return;
  if (!live.halfTimeAt) {
    if (!window.confirm("Half-time now? The clock stops until you start the second half.")) return;
    closeLiveChain();
    const tag = liveTag("half_time", { done: true });
    live.halfTimeAt = tag.liveAt;
    addLiveTag(tag, { last: false });
    notifyLive("Half-time. Press Start 2nd half on the restart whistle.", "success");
    return;
  }
  const at = liveClock.now();
  live.secondHalfAt = at;
  addLiveTag(liveTag("kick_off", { liveAnchor: "second_half", liveHalf: 2 }), { last: false });
  notifyLive("Second half started.", "success");
}

function liveEnd() {
  const live = state.live;
  if (!liveRunning() || !window.confirm("End the match? You can't add more live moments after this.")) return;
  const tag = liveTag("end_of_game", { done: true });
  live.endedAt = tag.liveAt;
  closeLiveChain();
  live.lastId = null;
  clearInterval(state.liveTicker);
  state.liveTicker = null;
  releaseScreen();
  addLiveTag(tag, { last: false });
  scheduleLiveSync(0);
}

function liveFinish() {
  const live = state.live;
  if (!live?.endedAt || (live.unsent || []).length) return;
  state.live = null;
  saveLiveLocal();
  $("#liveName").value = "";
  notifyLive("");
  closeLive();
  notify(`"${live.title}" is under Waiting for video. Open it there and paste the Vimeo link when the video is uploaded.`, "success");
}

// Brings back a match left open on this device (a reload or a closed tab mid-match).
function restoreLive() {
  const saved = loadLiveLocal();
  if (!saved || state.role !== "admin") return false;
  state.live = saved;
  if (!saved.endedAt) {
    clearInterval(state.liveTicker);
    state.liveTicker = setInterval(renderLiveClock, 1000);
  }
  if (!saved.inserted || saved.unsent.length) scheduleLiveSync(0);
  return true;
}

// Every event type a moment can have from the "More types" sheet (markers come from the match buttons).
function pickableTypes() {
  return eventTypes.filter(([value]) => value && value !== "other" && !markerTypes.has(value));
}

// "More types…" saves the time first, then asks for the type, so searching never makes the tag late.
function liveMoreTypes() {
  const tag = liveMark("");
  if (tag) openLiveTypes(tag.id);
}

function openLiveTypes(tagId) {
  const tag = state.live?.tags.find((item) => item.id === tagId);
  if (!tag) return;
  state.liveTypeTargetId = tagId;
  $("#liveTypeTime").textContent = `Time already saved · ${formatTime(liveMatchSeconds(tag.liveAt))}`;
  $("#liveTypeSearch").value = "";
  renderLiveTypeList();
  const dialog = $("#liveTypeDialog");
  if (!dialog.open) dialog.showModal();
  // On a phone the keyboard would cover the list, so only put the cursor in the search box with a mouse.
  if (!window.matchMedia?.("(pointer: coarse)").matches) $("#liveTypeSearch").focus();
  else $("#liveTypeSearch").blur();
}

function renderLiveTypeList() {
  const query = $("#liveTypeSearch").value.trim();
  const needle = query.toLowerCase();
  const used = new Set(state.live?.tags.map((tag) => tag.eventType) || []);
  const types = pickableTypes()
    .filter(([, label]) => !needle || label.toLowerCase().includes(needle))
    .sort(([firstValue, first], [secondValue, second]) => (used.has(secondValue) - used.has(firstValue)) || first.localeCompare(second));
  const buttons = types.map(([value, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "live-type-choice";
    button.classList.toggle("used", used.has(value));
    button.textContent = label;
    button.addEventListener("click", () => setLiveType(value, ""));
    return button;
  });
  if (query && !types.some(([, label]) => label.toLowerCase() === needle)) {
    const own = document.createElement("button");
    own.type = "button";
    own.className = "live-type-choice own";
    own.textContent = `Use "${query}"`;
    own.addEventListener("click", () => setLiveType("other", query));
    buttons.push(own);
  }
  $("#liveTypeList").replaceChildren(...buttons);
}

function setLiveType(eventType, customEventType) {
  const tag = state.live?.tags.find((item) => item.id === state.liveTypeTargetId);
  $("#liveTypeDialog").close();
  if (!tag) return;
  tag.eventType = eventType;
  tag.customEventType = customEventType;
  tag.done = isComplete(tag);
  // The time follows the type: e.g. a Goal picked from More types moves to 15 seconds before the tap.
  if (typeof tag.liveTapAt === "number") {
    tag.liveAt = liveTimeFor(tag.liveTapAt, eventType);
    tag.timestampSeconds = Math.max(0, Math.round(liveMatchSeconds(tag.liveAt) * 10) / 10);
  }
  state.liveTypeTargetId = "";
  liveChanged([tag.id]);
  notifyLive(`${tagEventLabel(tag)} at ${formatTime(liveMatchSeconds(tag.liveAt))}.`, "success");
}

// ---- Lining live moments up with the video ----

function liveAnchor(tags, name) {
  return tags.find((tag) => tag.liveAnchor === name && typeof tag.liveAt === "number") || null;
}

function isLiveMatch(tags) {
  return !!liveAnchor(tags, "kickoff");
}

// Accepts "14:15:09", "14:15", "2:15:09 pm" and returns seconds since midnight, or null.
function parseClockTime(value) {
  const match = /^\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?m\.?)?\s*$/i.exec(value || "");
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] || 0);
  const meridiem = match[4]?.[0].toLowerCase();
  if (minutes > 59 || seconds > 59 || hours > (meridiem ? 12 : 23) || (meridiem && hours === 0)) return null;
  if (meridiem === "p" && hours < 12) hours += 12;
  if (meridiem === "a" && hours === 12) hours = 0;
  return hours * 3600 + minutes * 60 + seconds;
}

function secondsOfDay(at) {
  const date = new Date(at);
  return date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds() + date.getMilliseconds() / 1000;
}

// Where each live moment lands in the video. method: "kickoff" (one anchor), "halves" (each half from
// its own kick-off) or "clock" (the camera's on-screen time of day at a known video time).
// Returns a Map of tag id to video seconds; throws with a message the admin can act on.
function liveAlignment(tags, { method, kickoff, second, clockVideo, clockShown, nudge = 0 }) {
  const first = liveAnchor(tags, "kickoff");
  if (!first) throw new Error("These moments weren't tagged live.");
  const restart = liveAnchor(tags, "second_half");
  let place;
  if (method === "clock") {
    if (clockVideo === null || clockVideo === undefined) throw new Error("Enter the video time, e.g. 04:12.");
    if (clockShown === null || clockShown === undefined) throw new Error("Enter the time the clock on screen shows, e.g. 14:15:09.");
    place = (tag) => {
      let difference = secondsOfDay(tag.liveAt) - clockShown;
      // A match never spans more than a few hours, so a big jump means it crossed midnight.
      if (difference > 43200) difference -= 86400;
      if (difference < -43200) difference += 86400;
      return clockVideo + difference;
    };
  } else {
    if (kickoff === null || kickoff === undefined) throw new Error("Enter where kick-off is in the video, e.g. 04:12.");
    const fromKickoff = (tag) => kickoff + (tag.liveAt - first.liveAt) / 1000;
    if (method === "halves") {
      if (!restart) throw new Error("This match has no second-half kick-off. Use Find kick-off instead.");
      if (second === null || second === undefined) throw new Error("Enter where the second half kicks off in the video.");
      if (second <= kickoff) throw new Error("The second-half kick-off must come after kick-off.");
      place = (tag) => (tag.liveHalf === 2 ? second + (tag.liveAt - restart.liveAt) / 1000 : fromKickoff(tag));
    } else {
      place = fromKickoff;
    }
  }
  return new Map(tags
    .filter((tag) => typeof tag.liveAt === "number")
    .map((tag) => [tag.id, Math.max(0, Math.round((place(tag) + nudge) * 10) / 10)]));
}

function alignMethod() {
  return document.querySelector('input[name="alignMethod"]:checked')?.value || "kickoff";
}

function alignInputs() {
  const time = (selector) => {
    const value = $(selector).value.trim();
    return value ? parseTime(value) : null;
  };
  return {
    method: alignMethod(),
    kickoff: time("#alignKickoff"),
    second: time("#alignSecond"),
    clockVideo: time("#alignClockVideo"),
    clockShown: $("#alignClockShown").value.trim() ? parseClockTime($("#alignClockShown").value) : null,
    nudge: state.alignNudge,
  };
}

// Shows the card for live matches, filled in from where the moments sit now.
function renderLiveAlign() {
  const card = $("#liveAlign");
  const live = isLiveMatch(state.tags) && state.role === "admin" && !state.noVideo;
  card.hidden = !live;
  if (!live) return;
  const first = liveAnchor(state.tags, "kickoff");
  const restart = liveAnchor(state.tags, "second_half");
  const lined = first.timestampSeconds > 0;
  card.open = !lined;
  state.alignNudge = 0;
  $("#alignKickoff").value = lined ? formatTime(first.timestampSeconds) : "";
  $("#alignSecond").value = lined && restart ? formatTime(restart.timestampSeconds) : "";
  $("#alignClockVideo").value = "";
  $("#alignClockShown").value = "";
  $("#alignHalvesOption").disabled = !restart;
  $("#alignHalvesNote").textContent = restart
    ? "Most accurate. Fixes a late restart or a camera paused at half-time."
    : "Needs Start 2nd half pressed during the match.";
  if (!restart && alignMethod() === "halves") document.querySelector('input[name="alignMethod"][value="kickoff"]').checked = true;
  renderAlignPreview();
}

function renderAlignPreview() {
  for (const fields of document.querySelectorAll(".align-fields")) {
    fields.hidden = !fields.dataset.methods.split(" ").includes(alignMethod());
  }
  $("#alignNudge").textContent = `${state.alignNudge > 0 ? "+" : ""}${state.alignNudge} s`;
  const live = state.tags.filter((tag) => typeof tag.liveAt === "number");
  $("#alignApplyButton").textContent = `Apply to ${plural(live.filter((tag) => !markerTypes.has(tag.eventType)).length, "moment")}`;
  let placed;
  try {
    placed = liveAlignment(state.tags, alignInputs());
  } catch (error) {
    $("#alignPreview").textContent = error.message;
    $("#alignApplyButton").disabled = true;
    return;
  }
  $("#alignApplyButton").disabled = !state.playerReady;
  const first = liveAnchor(state.tags, "kickoff");
  const seconds = [...placed.values()];
  const last = Math.max(...seconds);
  const late = state.videoDuration ? seconds.filter((value) => value > state.videoDuration).length : 0;
  $("#alignPreview").textContent = [
    `Kick-off lands at ${formatTime(placed.get(first.id))}, the last moment at ${formatTime(last)}.`,
    late ? `${plural(late, "moment")} would land after the end of the video: check the times you entered.` : "",
  ].filter(Boolean).join(" ");
}

function applyLiveAlignment() {
  let placed;
  try {
    placed = liveAlignment(state.tags, alignInputs());
  } catch (error) {
    notify(error.message, "error");
    return;
  }
  state.tags = state.tags.map((tag) => (placed.has(tag.id) ? { ...tag, timestampSeconds: placed.get(tag.id) } : tag)).sort(byTime);
  setDirty();
  renderTags();
  const first = liveAnchor(state.tags, "kickoff");
  const kickoffAt = first.timestampSeconds;
  $("#liveAlign").open = false;
  notify(`${plural(placed.size, "live moment")} lined up: kick-off is at ${formatTime(kickoffAt)}. Click a tick on the timeline to check one.`, "success");
  renderAlignPreview();
}

async function usePausedTime(selector) {
  if (!state.player || !state.playerReady) return;
  try {
    $(selector).value = formatTime(await state.player.getCurrentTime());
    renderAlignPreview();
  } catch (error) {
    notify(`Could not read the video time: ${error.message}`, "error");
  }
}

$("#liveMatchButton").addEventListener("click", async () => {
  await flushAutosave();
  openLive();
});
$("#liveResumeButton").addEventListener("click", openLive);
$("#liveCloseButton").addEventListener("click", closeLive);
$("#liveSetup").addEventListener("submit", startLiveMatch);
$("#liveUndoButton").addEventListener("click", liveUndo);
$("#liveChangeButton").addEventListener("click", () => {
  if (state.live?.lastId) openLiveTypes(state.live.lastId);
});
$("#liveHalfButton").addEventListener("click", liveHalfTime);
$("#livePassStart").addEventListener("click", liveStartPasses);
$("#livePassPlus").addEventListener("click", () => liveCountPass(1));
$("#livePassMinus").addEventListener("click", () => liveCountPass(-1));
$("#livePassStop").addEventListener("click", liveStopPasses);
$("#liveEndButton").addEventListener("click", liveEnd);
$("#liveDoneButton").addEventListener("click", liveFinish);
$("#liveTypeLater").addEventListener("click", () => {
  state.liveTypeTargetId = "";
  $("#liveTypeDialog").close();
});
$("#liveTypeSearch").addEventListener("input", renderLiveTypeList);
$("#liveTypeSearch").addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  $("#liveTypeList button")?.click();
});
window.addEventListener("online", () => {
  if (state.live && (state.live.unsent.length || !state.live.inserted)) syncLive();
});
window.addEventListener("offline", renderLiveSync);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || !liveRunning()) return;
  renderLiveClock();
  keepScreenOn();
  if (state.live.unsent.length) syncLive();
});
document.querySelectorAll('input[name="alignMethod"]').forEach((input) => input.addEventListener("change", renderAlignPreview));
for (const selector of ["#alignKickoff", "#alignSecond", "#alignClockVideo", "#alignClockShown"]) {
  $(selector).addEventListener("input", renderAlignPreview);
}
$("#alignKickoffUse").addEventListener("click", () => usePausedTime("#alignKickoff"));
$("#alignSecondUse").addEventListener("click", () => usePausedTime("#alignSecond"));
$("#alignClockUse").addEventListener("click", () => usePausedTime("#alignClockVideo"));
$("#alignNudgeDown").addEventListener("click", () => {
  state.alignNudge -= 1;
  renderAlignPreview();
});
$("#alignNudgeUp").addEventListener("click", () => {
  state.alignNudge += 1;
  renderAlignPreview();
});
$("#alignApplyButton").addEventListener("click", applyLiveAlignment);
$("#attachButton").addEventListener("click", attachVideo);
$("#attachUrl").addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  attachVideo();
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
  if (!state.isDirty && !state.live?.unsent?.length) return;
  event.preventDefault();
  event.returnValue = "";
});
