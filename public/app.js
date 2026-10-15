const $ = (selector) => document.querySelector(selector);
const eventTypes = [
  ["", "Choose event type…"],
  ["goal", "Goal"],
  ["shot_on_target", "Shot on target"],
  ["shot_off_target", "Shot off target"],
  ["save", "Save"],
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
  ["cross", "Cross"],
  ["other", "Other"],
];

const state = {
  video: null,
  player: null,
  watchPlayer: null,
  watchLoadId: 0,
  selectedWatchId: "",
  activeTab: "tag",
  activeRecord: null,
  records: [],
  tags: [],
  playerReady: false,
  isDirty: false,
  isSaving: false,
};

function notify(message, kind = "") {
  const notice = $("#notice");
  notice.textContent = message;
  notice.className = `notice ${kind}`.trim();
}

function notifyWatch(message, kind = "") {
  const notice = $("#watchNotice");
  notice.textContent = message;
  notice.className = `notice ${kind}`.trim();
}

function setTab(tab) {
  state.activeTab = tab;
  for (const button of document.querySelectorAll(".tab-button")) {
    const active = button.dataset.tab === tab;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  }
  $("#tagPanel").hidden = tab !== "tag";
  $("#watchPanel").hidden = tab !== "watch";
}

async function api(url, options = {}) {
  const response = await fetch(url, options);
  let data;
  try {
    data = await response.json();
  } catch {
    data = {};
  }
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
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

function tagStorageKey(video) {
  return `touchline:vimeo-tags:v1:${video.id}:${video.hash || "public"}`;
}

function loadTags(video) {
  const stored = localStorage.getItem(tagStorageKey(video));
  if (stored === null) return [];

  let parsed;
  try {
    parsed = JSON.parse(stored);
  } catch {
    throw new Error("Saved tags could not be read. Clear this video's saved browser data to start over.");
  }
  if (!Array.isArray(parsed) || parsed.some((tag) =>
    !tag || typeof tag.id !== "string" ||
    typeof tag.timestampSeconds !== "number" || !Number.isFinite(tag.timestampSeconds) || tag.timestampSeconds < 0 ||
    (tag.eventType !== undefined && typeof tag.eventType !== "string") ||
    (tag.playerNames !== undefined && typeof tag.playerNames !== "string") ||
    (tag.note !== undefined && typeof tag.note !== "string") ||
    (tag.label !== undefined && typeof tag.label !== "string")
  )) {
    throw new Error("Saved tags have an invalid format and could not be loaded.");
  }
  return parsed.map((tag) => ({
    id: tag.id,
    timestampSeconds: tag.timestampSeconds,
    eventType: tag.eventType || "",
    playerNames: tag.playerNames || "",
    note: tag.note || tag.label || "",
  }));
}

function setDirty() {
  state.isDirty = true;
  $("#saveHint").textContent = "Unsaved changes";
  refreshActions();
}

function refreshActions() {
  $("#markMomentButton").disabled = !state.playerReady || state.isSaving;
  $("#saveVideoButton").disabled = !state.activeRecord || state.isSaving;
  $("#publishVideoButton").disabled = !state.activeRecord || state.isSaving;
  $("#publishVideoButton").textContent = state.activeRecord?.status === "published" ? "Re-publish changes" : "Publish video";
  document.querySelectorAll(".tag-time").forEach((button) => { button.disabled = !state.playerReady; });
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
      const item = document.createElement("div");
      item.className = "saved-video-item";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "saved-video";
      const title = document.createElement("strong");
      title.textContent = record.title;
      const details = document.createElement("span");
      details.textContent = `${record.tags.length} moment${record.tags.length === 1 ? "" : "s"} · Updated ${new Date(record.updatedAt).toLocaleDateString()}`;
      button.append(title, details);
      button.addEventListener("click", async () => {
        if (!confirmDiscard()) return;
        $("#videoName").value = record.title;
        $("#videoUrl").value = record.vimeoUrl;
        await openVideo(record.vimeoUrl, record);
      });

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "remove-video";
      removeButton.textContent = "Remove";
      removeButton.setAttribute("aria-label", `Remove ${record.title} from the library`);
      removeButton.addEventListener("click", () => removeVideo(record));
      item.append(button, removeButton);
      return item;
    }));
  }
  renderWatchVideoOptions();
}

function renderWatchVideoOptions() {
  const published = state.records.filter((record) => record.status === "published");
  const selectionExists = published.some((record) => record.id === state.selectedWatchId);
  const selectedId = selectionExists ? state.selectedWatchId : "";
  const selector = $("#watchVideoSelect");
  selector.replaceChildren(new Option("Choose a published video…", ""));
  for (const record of published) {
    selector.add(new Option(`${record.title} (${record.tags.length} moments)`, record.id));
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
    await api(`/api/videos/${record.id}`, { method: "DELETE" });
    state.records = state.records.filter((item) => item.id !== record.id);
    renderLibrary();
    if (state.activeRecord?.id === record.id) {
      state.isDirty = false;
      await startNewVideo();
    }
    notify(`"${record.title}" was removed from the library.`, "success");
  } catch (error) {
    notify(`Could not remove "${record.title}": ${error.message}`, "error");
  }
}

async function loadLibrary() {
  try {
    state.records = await api("/api/videos");
    renderLibrary();
  } catch (error) {
    notify(`Could not load saved videos: ${error.message}`, "error");
  }
}

function watchEventTitle(tag) {
  const label = tag.eventType
    ? eventTypes.find(([value]) => value === tag.eventType)?.[1] || tag.eventType.replaceAll("_", " ")
    : "Unclassified moment";
  const details = [tag.playerNames, tag.note].filter(Boolean).join(" · ");
  return details ? `${label} — ${details}` : label;
}

function renderWatchEvents(record) {
  const tags = [...record.tags].sort((first, second) => first.timestampSeconds - second.timestampSeconds);
  $("#watchEventCount").textContent = tags.length;
  $("#watchNoEvents").hidden = tags.length > 0;
  $("#watchEventList").replaceChildren(...tags.map((tag) => {
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
  state.watchPlayer.setCurrentTime(timestampSeconds).catch((error) => {
    notifyWatch(`Could not seek to ${formatTime(timestampSeconds)}: ${error.message}`, "error");
  });
  state.watchPlayer.play().catch((error) => {
    notifyWatch(`Jumped to ${formatTime(timestampSeconds)}, but could not start playback: ${error.message}`, "error");
  });
  notifyWatch(`Playing from ${formatTime(timestampSeconds)}.`, "success");
}

async function selectWatchVideo(recordId) {
  const record = state.records.find((item) => item.id === recordId && item.status === "published");
  state.selectedWatchId = record?.id || "";
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
  if (!record) {
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
    document.querySelectorAll(".watch-event").forEach((button) => { button.disabled = false; });
    notifyWatch(`${record.title} is ready. Choose a moment or watch the whole video.`, "success");
  } catch (error) {
    if (loadId === state.watchLoadId) {
      state.watchPlayer = null;
      notifyWatch(`Could not open this Vimeo video: ${error.message}`, "error");
    }
  }
}

function renderTags() {
  const list = $("#tagList");
  $("#tagCount").textContent = state.tags.length;
  $("#emptyTags").hidden = state.tags.length > 0;
  list.replaceChildren(...state.tags.map((tag) => {
    const row = document.createElement("li");
    row.className = "tag-row";

    const seekButton = document.createElement("button");
    seekButton.className = "tag-time";
    seekButton.type = "button";
    seekButton.textContent = formatTime(tag.timestampSeconds);
    seekButton.disabled = !state.playerReady;
    seekButton.setAttribute("aria-label", `Seek to ${formatTime(tag.timestampSeconds)}`);
    seekButton.addEventListener("click", () => {
      state.player.setCurrentTime(tag.timestampSeconds).catch((error) => {
        notify(`Could not seek to this tag: ${error.message}`, "error");
      });
    });

    const deleteButton = document.createElement("button");
    deleteButton.className = "delete-tag";
    deleteButton.type = "button";
    deleteButton.textContent = "×";
    deleteButton.setAttribute("aria-label", `Delete moment at ${formatTime(tag.timestampSeconds)}`);
    deleteButton.addEventListener("click", () => {
      state.tags = state.tags.filter((item) => item.id !== tag.id);
      setDirty();
      renderTags();
    });

    const details = document.createElement("div");
    details.className = "tag-details";

    const eventType = document.createElement("select");
    eventType.className = "event-type";
    eventType.setAttribute("aria-label", `Event type at ${formatTime(tag.timestampSeconds)}`);
    for (const [value, text] of eventTypes) eventType.add(new Option(text, value));
    eventType.value = tag.eventType;
    eventType.addEventListener("change", () => updateTag(tag.id, "eventType", eventType.value));

    const playerNames = document.createElement("input");
    playerNames.className = "player-names";
    playerNames.type = "text";
    playerNames.maxLength = 200;
    playerNames.value = tag.playerNames;
    playerNames.placeholder = "Player name(s), comma separated";
    playerNames.setAttribute("aria-label", `Player names at ${formatTime(tag.timestampSeconds)}`);
    playerNames.addEventListener("change", () => updateTag(tag.id, "playerNames", playerNames.value.trim()));

    const note = document.createElement("input");
    note.className = "moment-note";
    note.type = "text";
    note.maxLength = 500;
    note.value = tag.note;
    note.placeholder = "Optional note";
    note.setAttribute("aria-label", `Optional note at ${formatTime(tag.timestampSeconds)}`);
    note.addEventListener("change", () => updateTag(tag.id, "note", note.value.trim()));

    details.append(eventType, playerNames, note);
    row.append(seekButton, details, deleteButton);
    return row;
  }));
}

function setPlayerReady(ready) {
  state.playerReady = ready;
  refreshActions();
}

function updateTag(id, field, value) {
  state.tags = state.tags.map((tag) => tag.id === id ? { ...tag, [field]: value } : tag);
  setDirty();
}

async function markMoment() {
  if (!state.playerReady || !state.player) return;
  try {
    const timestampSeconds = await state.player.getCurrentTime();
    const tags = [...state.tags, {
      id: crypto.randomUUID(),
      timestampSeconds,
      eventType: "",
      playerNames: "",
      note: "",
    }].sort((first, second) => first.timestampSeconds - second.timestampSeconds);
    state.tags = tags;
    setDirty();
    renderTags();
    notify(`Moment marked at ${formatTime(timestampSeconds)}. Add its event type and player names below.`, "success");
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

function confirmDiscard() {
  return !state.isDirty || window.confirm("You have unsaved changes. Discard them and continue?");
}

async function openVideo(value, record = null) {
  let video;
  try {
    video = parseVimeoUrl(value);
    state.tags = record ? record.tags : loadTags(video);
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
  state.activeRecord = record || {
    id: crypto.randomUUID(),
    title: $("#videoName").value.trim(),
    vimeoUrl: value,
    status: "in_progress",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    publishedAt: null,
    tags: state.tags,
  };
  state.isDirty = false;
  state.player = null;
  setPlayerReady(false);
  $("#saveHint").textContent = record ? `Saved ${record.status === "published" ? "as published" : "in progress"}` : "Not saved yet";
  renderTags();
  $("#videoCard").hidden = false;
  $("#tagsCard").hidden = false;
  notify("Loading Vimeo video…");

  const frame = document.createElement("iframe");
  frame.title = "Vimeo video";
  frame.allow = "autoplay; fullscreen; picture-in-picture; encrypted-media";
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
    await state.player.ready();
    setPlayerReady(true);
    notify(record
      ? `Opened ${record.title}. Save your edits to the library or re-publish them when ready.`
      : "Video ready. Press Enter or use Mark moment while you watch.", "success");
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
    throw new Error("The Vimeo link changed. Open that link before saving its tags.");
  }
  return {
    id: state.activeRecord.id,
    title,
    vimeoUrl,
    tags: state.tags,
  };
}

async function saveVideo(publish = false) {
  if (!state.activeRecord || !state.playerReady || state.isSaving) return;
  let payload;
  try {
    payload = videoPayload();
  } catch (error) {
    notify(error.message, "error");
    return;
  }

  state.isSaving = true;
  refreshActions();
  $("#saveHint").textContent = publish ? "Publishing…" : "Saving to file…";
  try {
    const endpoint = `/api/videos/${state.activeRecord.id}${publish ? "/publish" : ""}`;
    const saved = await api(endpoint, {
      method: publish ? "POST" : "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    state.activeRecord = saved;
    state.isDirty = false;
    state.tags = saved.tags;
    $("#videoName").value = saved.title;
    $("#videoUrl").value = saved.vimeoUrl;
    $("#saveHint").textContent = `Saved ${saved.status === "published" ? "as published" : "in progress"}`;
    notify(publish
      ? `${saved.title} published. You can reopen and re-publish it after further edits.`
      : `${saved.title} saved to the video library.`, "success");
    try {
      await loadLibrary();
    } catch (error) {
      notify(`Video saved, but the library list could not refresh: ${error.message}`, "error");
    }
  } catch (error) {
    $("#saveHint").textContent = "Save failed";
    notify(`Could not ${publish ? "publish" : "save"} video: ${error.message}`, "error");
  } finally {
    state.isSaving = false;
    refreshActions();
  }
}

async function startNewVideo() {
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
  setPlayerReady(false);
  $("#videoName").value = "";
  $("#videoUrl").value = "";
  $("#videoFrame").replaceChildren();
  $("#videoCard").hidden = true;
  $("#tagsCard").hidden = true;
  $("#saveHint").textContent = "Not saved yet";
  notify("Enter a video name and Vimeo link to start tagging.");
}

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

window.addEventListener("keydown", (event) => {
  if (state.activeTab !== "tag") return;
  if (event.key !== "Enter" || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
  const target = event.target;
  if (target instanceof HTMLElement && (
    target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName)
  )) return;
  event.preventDefault();
  markMoment();
});

loadLibrary().catch((error) => notify(`Could not load saved videos: ${error.message}`, "error"));

window.addEventListener("beforeunload", (event) => {
  if (!state.isDirty) return;
  event.preventDefault();
  event.returnValue = "";
});
