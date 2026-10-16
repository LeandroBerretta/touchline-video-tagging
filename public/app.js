import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const $ = (selector) => document.querySelector(selector);
const config = window.TOUCHLINE_CONFIG;
const supabase = config?.url && config?.publishableKey
  ? createClient(config.url, config.publishableKey)
  : null;
const eventTypes = [
  ["", "Choose event type…"],
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
  ["other", "Other"],
];
// Shown as one-tap buttons on moments that still need a type.
const quickEventTypes = ["pass", "shot_on_target", "shot_off_target", "tackle", "foul", "goal"];
const markOffsetChoices = [0, 3, 5, 10];
const markOffsetStorageKey = "touchline.markOffsetSeconds";
const libraryHiddenStorageKey = "touchline.libraryHidden";
const seekStepSeconds = 5;
// Watch playback starts a little before each moment so viewers see the build-up.
const watchLeadSeconds = 3;
const errorMessages = [
  [/invalid login credentials/i, "The email or password is incorrect."],
  [/email not confirmed/i, "This email address has not been confirmed yet. Use the link in the confirmation email first."],
  [/failed to fetch|networkerror|load failed/i, "Could not reach the server. Check your internet connection and try again."],
  [/jwt expired|refresh token/i, "Your session has expired. Sign out and sign in again."],
  [/row-level security|permission denied/i, "Your account does not have permission to do that."],
  [/rate limit|too many requests/i, "Too many attempts. Wait a minute and try again."],
  [/password should be at least/i, "That password is too short. Use at least 8 characters."],
];

const state = {
  video: null,
  player: null,
  watchPlayer: null,
  watchLoadId: 0,
  selectedWatchId: "",
  watchTypeFilter: "",
  watchPlayerFilter: "",
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

function notifyWatch(message, kind = "") {
  showNotice("#watchNotice", message, kind);
}

function friendlyError(error) {
  const message = error?.message || String(error);
  const match = errorMessages.find(([pattern]) => pattern.test(message));
  return match ? match[1] : message;
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

function normalizeTag(tag) {
  return {
    ...tag,
    eventType: tag.eventType || "",
    customEventType: tag.customEventType || "",
    playerNames: tag.playerNames || "",
    note: tag.note || "",
  };
}

function serializeTag(tag) {
  return {
    id: tag.id,
    timestampSeconds: tag.timestampSeconds,
    eventType: tag.eventType || "",
    customEventType: tag.eventType === "other" ? (tag.customEventType || "").trim() : "",
    playerNames: (tag.playerNames || "").trim(),
    note: (tag.note || "").trim(),
    completed: isComplete(tag),
  };
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function setDirty() {
  state.isDirty = true;
  $("#saveHint").textContent = "Unsaved changes";
  refreshActions();
}

function actionHint(incomplete, isPublished) {
  if (!state.activeRecord || !state.playerReady) return "";
  const parts = [];
  if (incomplete) {
    parts.push(incomplete === 1
      ? "1 moment without an event type is saved but hidden from viewers until it has one."
      : `${incomplete} moments without an event type are saved but hidden from viewers until they have one.`);
  }
  if (isPublished) parts.push(state.isDirty ? "Viewers see your changes after you re-publish." : "No changes since this video was published.");
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
  document.querySelectorAll(".tag-time, .use-video-time").forEach((button) => { button.disabled = !state.playerReady; });
}

function renderLibrary() {
  for (const [status, listSelector, countSelector, emptyMessage] of [
    ["in_progress", "#inProgressList", "#inProgressCount", "No videos in progress."],
    ["published", "#publishedList", "#publishedCount", "No published videos yet."],
  ]) {
    const records = state.records.filter((record) => record.status === status);
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
      details.textContent = [
        plural(record.tags.length, "moment"),
        incomplete ? `${incomplete} need${incomplete === 1 ? "s" : ""} a type` : "",
        `Updated ${new Date(record.updatedAt).toLocaleDateString()}`,
      ].filter(Boolean).join(" · ");
      button.append(title, details);
      button.addEventListener("click", async () => {
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
        item.append(button, removeButton);
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

function renderWatchVideoOptions() {
  const published = state.records.filter((record) => record.status === "published");
  const selectionExists = published.some((record) => record.id === state.selectedWatchId);
  const selectedId = selectionExists ? state.selectedWatchId : "";
  const selector = $("#watchVideoSelect");
  selector.replaceChildren(new Option("Choose a published video…", ""));
  for (const record of published) {
    selector.add(new Option(`${record.title} (${plural(record.tags.filter(isComplete).length, "moment")})`, record.id));
  }
  selector.value = selectedId;
  if (selectedId) {
    const selectedRecord = published.find((record) => record.id === selectedId);
    $("#watchVideoTitle").textContent = selectedRecord.title;
    renderWatchEvents(selectedRecord);
  }

  if (state.selectedWatchId && !selectionExists) {
    state.selectedWatchId = "";
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
    tags: record.tags,
  }));
  renderLibrary();
}

function tagEventLabel(tag) {
  if (tag.customEventType && tag.customEventType.trim()) {
    return tag.customEventType.trim();
  }
  if (tag.eventType === "other") {
    return "Other";
  }
  if (tag.eventType) {
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

function renderWatchEvents(record) {
  // Published videos only contain complete moments, but older rows may predate that rule.
  const tags = record.tags.filter(isComplete).sort(byTime);
  const labels = [...new Set(tags.map(tagEventLabel))].sort((first, second) => first.localeCompare(second));
  if (!labels.includes(state.watchTypeFilter)) state.watchTypeFilter = "";
  const typeFilter = $("#watchTypeFilter");
  typeFilter.replaceChildren(new Option("All event types", ""), ...labels.map((label) => new Option(label, label)));
  typeFilter.value = state.watchTypeFilter;

  const playerQuery = state.watchPlayerFilter.trim().toLowerCase();
  const visible = tags.filter((tag) => (!state.watchTypeFilter || tagEventLabel(tag) === state.watchTypeFilter)
    && (!playerQuery || tag.playerNames?.toLowerCase().includes(playerQuery)));

  $("#watchFilters").hidden = tags.length === 0;
  $("#watchEventCount").textContent = visible.length === tags.length ? tags.length : `${visible.length} of ${tags.length}`;
  $("#watchNoEvents").hidden = visible.length > 0;
  $("#watchNoEvents").textContent = tags.length ? "No events match these filters." : "This video has no tagged events yet.";
  $("#watchEventList").replaceChildren(...visible.map((tag) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "watch-event";
    button.disabled = !state.watchPlayer;

    const time = document.createElement("span");
    time.className = "watch-event-time";
    time.textContent = formatTime(tag.timestampSeconds);
    const title = document.createElement("span");
    title.className = "watch-event-title";
    title.textContent = watchEventTitle(tag);

    button.append(time, title);
    button.addEventListener("click", () => playWatchMoment(tag.timestampSeconds));
    item.append(button);
    return item;
  }));
}

function playWatchMoment(timestampSeconds) {
  if (!state.watchPlayer) return;
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
  state.watchTypeFilter = "";
  state.watchPlayerFilter = "";
  $("#watchPlayerFilter").value = "";
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

  try {
    await loadVimeoSdk();
    if (loadId !== state.watchLoadId) return;
    const player = new window.Vimeo.Player(frame);
    state.watchPlayer = player;
    player.on("error", (error) => {
      if (loadId === state.watchLoadId) notifyWatch(`Vimeo player error: ${error.message || "The video could not be played."}`, "error");
    });
    await player.ready();
    if (loadId !== state.watchLoadId) {
      await player.destroy();
      return;
    }
    $("#watchWholeVideoButton").disabled = false;
    $("#watchFullscreenButton").disabled = false;
    document.querySelectorAll(".watch-event").forEach((button) => { button.disabled = false; });
    notifyWatch(`${record.title} is ready. Choose a moment or watch the whole video.`, "success");
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

function renderTagRow(tag) {
  const time = formatTime(tag.timestampSeconds);
  const row = document.createElement("li");
  row.className = "tag-row";
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
  for (const value of quickEventTypes) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "quick-type";
    chip.textContent = eventTypes.find(([type]) => type === value)[1];
    chip.addEventListener("click", () => {
      eventType.value = value;
      applyEventType(value);
      playerNames.focus();
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

  const playerNames = document.createElement("input");
  playerNames.className = "player-names";
  playerNames.type = "text";
  playerNames.maxLength = 200;
  playerNames.value = tag.playerNames || "";
  playerNames.placeholder = "Player name(s), comma separated";
  playerNames.setAttribute("list", "playerNameOptions");
  playerNames.setAttribute("aria-label", `Player names at ${time}`);
  playerNames.addEventListener("input", () => updateTag(tag.id, { playerNames: playerNames.value }));

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

  function applyEventType(value) {
    if (value === "other") {
      updateTag(tag.id, { eventType: value });
    } else {
      customEvent.value = "";
      updateTag(tag.id, { eventType: value, customEventType: "" });
    }
    refreshRow();
  }

  function refreshRow() {
    const current = state.tags.find((item) => item.id === tag.id);
    if (!current) return;
    const complete = isComplete(current);
    row.classList.toggle("incomplete", !complete);
    status.hidden = complete;
    status.textContent = current.eventType === "other" ? "Name this event" : "Needs an event type";
    quickTypes.hidden = !!current.eventType;
    customWrap.hidden = current.eventType !== "other";
  }

  details.append(timeEditor, status, quickTypes, eventType, customWrap, playerNames, note);
  row.append(timeColumn, details, deleteButton);
  refreshRow();
  return row;
}

function renderTags() {
  $("#emptyTags").hidden = state.tags.length > 0;
  $("#tagList").replaceChildren(...state.tags.map(renderTagRow));
  renderPlayerSuggestions();
  refreshActions();
}

function setPlayerReady(ready) {
  state.playerReady = ready;
  refreshActions();
}

function markOffsetSeconds() {
  const value = Number($("#markOffset").value);
  return markOffsetChoices.includes(value) ? value : 0;
}

async function markMoment() {
  if (!state.playerReady || !state.player) return;
  try {
    const offset = markOffsetSeconds();
    const timestampSeconds = Math.max(0, await state.player.getCurrentTime() - offset);
    const tag = {
      id: crypto.randomUUID(),
      timestampSeconds,
      eventType: "",
      customEventType: "",
      playerNames: "",
      note: "",
    };
    state.tags = [...state.tags, tag].sort(byTime);
    setDirty();
    renderTags();
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
  state.tags = record ? (record.tags || []).map(normalizeTag).sort(byTime) : [];
  state.activeRecord = record || {
    id: crypto.randomUUID(),
    title: $("#videoName").value.trim(),
    vimeoUrl: value,
    status: "in_progress",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    publishedAt: null,
    tags: [],
  };
  state.isDirty = false;
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
    setPlayerReady(true);
    notify(record
      ? record.status === "published"
        ? `Opened ${record.title}. It is published: viewers see your edits once you re-publish.`
        : `Opened ${record.title}. Save your progress or publish when every moment has a type.`
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
  return {
    id: state.activeRecord.id,
    title,
    vimeoUrl,
    tags: state.tags.map(serializeTag),
  };
}

async function saveVideo(publish = false) {
  if (!state.activeRecord || !state.playerReady || state.isSaving) return;
  if (!publish && state.activeRecord.status === "published") {
    notify("This video is published. Use Re-publish changes to update what viewers see.", "error");
    return;
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
  $("#saveHint").textContent = publish ? "Publishing…" : "Saving…";
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
        published_at: publish ? now : state.activeRecord.publishedAt,
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
      tags: data.tags,
    };
    state.activeRecord = saved;
    state.isDirty = false;
    state.tags = saved.tags.map(normalizeTag).sort(byTime);
    $("#videoName").value = saved.title;
    $("#videoUrl").value = saved.vimeoUrl;
    $("#saveHint").textContent = `Saved ${saved.status === "published" ? "as published" : "in progress"}`;
    renderTags();
    const hiddenNote = incomplete
      ? ` ${plural(incomplete, "moment")} without an event type ${incomplete === 1 ? "is" : "are"} hidden from viewers.`
      : "";
    notify(publish
      ? `${saved.title} is published. Viewers can watch it now.${hiddenNote}`
      : `${saved.title} saved. It stays hidden from viewers until you publish it.`, "success");
    try {
      await loadLibrary();
    } catch (loadError) {
      notify(`${saved.title} was saved, but the library list could not refresh: ${friendlyError(loadError)}`, "error");
    }
  } catch (error) {
    $("#saveHint").textContent = "Save failed";
    notify(`Video ${publish ? "publish" : "save"} failed: ${friendlyError(error)}`, "error");
  } finally {
    state.isSaving = false;
    refreshActions();
  }
}

async function startNewVideo() {
  if (state.role !== "admin") return;
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

async function activateSession(session) {
  // Supabase re-reports the same session on token refresh, tab focus, and sign-in; only react when the user changes.
  const userId = session?.user.id ?? null;
  if (userId === state.sessionUserId) return;
  state.sessionUserId = userId;

  if (!session) {
    state.role = null;
    state.records = [];
    state.activeRecord = null;
    state.tags = [];
    state.isDirty = false;
    state.selectedWatchId = "";
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
    return;
  }

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
    await supabase.auth.signOut();
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

$("#signOutButton").addEventListener("click", async () => {
  if (!confirmDiscard()) return;
  const { error } = await supabase.auth.signOut();
  if (error) {
    notify(`Could not sign out: ${friendlyError(error)}`, "error");
    return;
  }
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

$("#markMomentButton").addEventListener("click", markMoment);
$("#saveVideoButton").addEventListener("click", () => saveVideo());
$("#publishVideoButton").addEventListener("click", () => saveVideo(true));
$("#newVideoButton").addEventListener("click", startNewVideo);
document.querySelectorAll(".tab-button").forEach((button) => {
  button.addEventListener("click", () => setTab(button.dataset.tab));
});
$("#watchVideoSelect").addEventListener("change", () => selectWatchVideo($("#watchVideoSelect").value));
$("#watchTypeFilter").addEventListener("change", () => {
  state.watchTypeFilter = $("#watchTypeFilter").value;
  const record = currentWatchRecord();
  if (record) renderWatchEvents(record);
});
$("#watchPlayerFilter").addEventListener("input", () => {
  state.watchPlayerFilter = $("#watchPlayerFilter").value;
  const record = currentWatchRecord();
  if (record) renderWatchEvents(record);
});
$("#watchWholeVideoButton").addEventListener("click", () => {
  if (!state.watchPlayer) return;
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
for (const selector of ["#markMomentButton", "#rewindButton", "#playPauseButton", "#forwardButton", "#tagFullscreenButton"]) {
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
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
  const target = event.target;
  if (target instanceof HTMLElement && (
    target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
  )) return;
  const onButton = target instanceof HTMLElement && target.tagName === "BUTTON";
  const actions = {
    Enter: () => markMoment(),
    " ": () => togglePlay(),
    ArrowLeft: () => seekBy(-seekStepSeconds),
    ArrowRight: () => seekBy(seekStepSeconds),
  };
  const action = actions[event.key];
  if (!action) return;
  // Enter and Space on a focused button should press that button, as usual.
  if (onButton && (event.key === "Enter" || event.key === " ")) return;
  if (event.repeat && (event.key === "Enter" || event.key === " ")) return;
  event.preventDefault();
  action();
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
