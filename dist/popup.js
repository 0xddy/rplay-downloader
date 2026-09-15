(() => {
  // src/media.js
  var ESTIMATED_PAYLOAD_RATIO = 0.68;
  function estimateMediaBytes(bandwidth, duration) {
    const bitsPerSecond = Number(bandwidth);
    const seconds = Number(duration);
    if (!(bitsPerSecond > 0) || !(seconds > 0)) return null;
    return Math.round(bitsPerSecond * seconds * ESTIMATED_PAYLOAD_RATIO / 8);
  }
  function createSourceId(masterUrl, streamUrl) {
    const value = `${masterUrl || ""}
${streamUrl || ""}`;
    let first = 3735928559 ^ value.length;
    let second = 1103547991 ^ value.length;
    for (let index = 0; index < value.length; index++) {
      const code = value.charCodeAt(index);
      first = Math.imul(first ^ code, 2654435761);
      second = Math.imul(second ^ code, 1597334677);
    }
    first = Math.imul(first ^ first >>> 16, 2246822507) ^ Math.imul(second ^ second >>> 13, 3266489909);
    second = Math.imul(second ^ second >>> 16, 2246822507) ^ Math.imul(first ^ first >>> 13, 3266489909);
    return `${(second >>> 0).toString(36)}${(first >>> 0).toString(36)}`;
  }

  // src/naming.js
  function normalizeVideoTitle(value) {
    const normalized = String(value || "").normalize("NFC").replace(/\s+/g, " ").replace(/\s*[|｜]\s*RPLAY\s*$/i, "").trim();
    return /^(?:rplay|rplay\.live)$/i.test(normalized) ? "" : normalized;
  }

  // src/protocol.js
  var TaskPhase = Object.freeze({
    QUEUED: "queued",
    PREPARING: "preparing",
    REMUXING: "remuxing",
    FALLBACK_TS: "fallback_ts",
    SAVING: "saving",
    COMPLETED: "completed",
    ERROR: "error"
  });
  var ACTIVE_TASK_PHASES = /* @__PURE__ */ new Set([
    TaskPhase.QUEUED,
    TaskPhase.PREPARING,
    TaskPhase.REMUXING,
    TaskPhase.FALLBACK_TS,
    TaskPhase.SAVING
  ]);
  var TERMINAL_TASK_PHASES = /* @__PURE__ */ new Set([
    TaskPhase.COMPLETED,
    TaskPhase.ERROR
  ]);
  var TASK_TRANSITIONS = /* @__PURE__ */ new Map([
    [TaskPhase.QUEUED, /* @__PURE__ */ new Set([TaskPhase.PREPARING, TaskPhase.ERROR])],
    [TaskPhase.PREPARING, /* @__PURE__ */ new Set([
      TaskPhase.REMUXING,
      TaskPhase.FALLBACK_TS,
      TaskPhase.SAVING,
      TaskPhase.ERROR
    ])],
    [TaskPhase.REMUXING, /* @__PURE__ */ new Set([TaskPhase.FALLBACK_TS, TaskPhase.SAVING, TaskPhase.ERROR])],
    [TaskPhase.FALLBACK_TS, /* @__PURE__ */ new Set([TaskPhase.SAVING, TaskPhase.ERROR])],
    [TaskPhase.SAVING, /* @__PURE__ */ new Set([TaskPhase.COMPLETED, TaskPhase.ERROR])]
  ]);
  var MessageType = Object.freeze({
    GET_VIDEO_INFO: "GET_VIDEO_INFO",
    GET_TASKS: "GET_TASKS",
    GET_DOWNLOAD_STATE: "GET_DOWNLOAD_STATE",
    DOWNLOAD_VIDEO: "DOWNLOAD_VIDEO",
    CANCEL_TASK: "CANCEL_TASK",
    OPEN_POPUP: "OPEN_POPUP",
    VIDEO_DETECTED: "VIDEO_DETECTED",
    VIDEO_INFO_CLEARED: "VIDEO_INFO_CLEARED",
    GET_PAGE_VIDEO_TITLE: "GET_PAGE_VIDEO_TITLE",
    TASK_CREATED: "TASK_CREATED",
    TASK_UPDATED: "TASK_UPDATED",
    TASK_COMPLETED: "TASK_COMPLETED",
    TASK_ERROR: "TASK_ERROR",
    OFFSCREEN_START: "OFFSCREEN_START",
    OFFSCREEN_CANCEL: "OFFSCREEN_CANCEL",
    OFFSCREEN_STATUS: "OFFSCREEN_STATUS",
    OFFSCREEN_RELEASE_FILE: "OFFSCREEN_RELEASE_FILE",
    OFFSCREEN_PROGRESS: "OFFSCREEN_PROGRESS",
    OFFSCREEN_FILE_READY: "OFFSCREEN_FILE_READY",
    OFFSCREEN_ERROR: "OFFSCREEN_ERROR",
    OFFSCREEN_CANCELED: "OFFSCREEN_CANCELED"
  });
  var BACKGROUND_MESSAGE_TYPES = /* @__PURE__ */ new Set([
    MessageType.GET_VIDEO_INFO,
    MessageType.GET_TASKS,
    MessageType.GET_DOWNLOAD_STATE,
    MessageType.DOWNLOAD_VIDEO,
    MessageType.CANCEL_TASK,
    MessageType.OPEN_POPUP,
    MessageType.OFFSCREEN_PROGRESS,
    MessageType.OFFSCREEN_FILE_READY,
    MessageType.OFFSCREEN_ERROR,
    MessageType.OFFSCREEN_CANCELED
  ]);
  var OFFSCREEN_MESSAGE_TYPES = /* @__PURE__ */ new Set([
    MessageType.OFFSCREEN_START,
    MessageType.OFFSCREEN_CANCEL,
    MessageType.OFFSCREEN_STATUS,
    MessageType.OFFSCREEN_RELEASE_FILE
  ]);
  var TASK_EVENT_MESSAGE_TYPES = /* @__PURE__ */ new Set([
    MessageType.TASK_CREATED,
    MessageType.TASK_UPDATED,
    MessageType.TASK_COMPLETED,
    MessageType.TASK_ERROR
  ]);

  // popup.js
  var currentTabId = null;
  var currentTasks = [];
  var videos = [];
  var currentPageTitle = "";
  var videoLoadVersion = 0;
  var pageTitleLoadVersion = 0;
  function message(key, substitutions, fallback = "") {
    return chrome.i18n.getMessage(key, substitutions) || fallback;
  }
  function initI18n() {
    const settingsLink = document.getElementById("drmSettings");
    settingsLink.title = message("drmSettings", null, "DRM \u8BBE\u7F6E");
    settingsLink.setAttribute("aria-label", settingsLink.title);
    document.getElementById("headerTitle").textContent = message("headerTitle", null, "RPlay Video Downloader");
    document.getElementById("headerSubtitle").textContent = message("headerSubtitle", null, "\u4E00\u952E\u4E0B\u8F7D rplay.live \u89C6\u9891");
    document.getElementById("noVideoTitle").textContent = message("noVideoDetected", null, "\u672A\u68C0\u6D4B\u5230\u89C6\u9891");
    document.getElementById("noVideoDesc").textContent = message("noVideoDescription", null, "\u8BF7\u6253\u5F00 RPlay \u89C6\u9891\u64AD\u653E\u9875\u9762");
    document.getElementById("footerText").textContent = message("footerText", null, "\u559C\u6B22\u672C\u63D2\u4EF6\u8BF7\u7ED9\u4E2A Star");
    document.getElementById("githubText").textContent = message("github", null, "GitHub");
  }
  document.addEventListener("DOMContentLoaded", async () => {
    initI18n();
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTabId = tab?.id ?? null;
    chrome.runtime.onMessage.addListener((request) => {
      if (request.type === MessageType.VIDEO_INFO_CLEARED && request.tabId === currentTabId) {
        videoLoadVersion += 1;
        pageTitleLoadVersion += 1;
        videos = [];
        currentPageTitle = "";
        render();
        return;
      }
      if (request.type === MessageType.VIDEO_DETECTED && request.tabId === currentTabId) {
        void Promise.all([loadVideos(), loadPageTitle()]).then(render);
        return;
      }
      if (!TASK_EVENT_MESSAGE_TYPES.has(request.type) || !request.task) return;
      upsertTask(request.task);
      if (ACTIVE_TASK_PHASES.has(request.task.phase)) {
        if (!patchTaskProgress(request.task)) attachTaskProgress(request.task);
      } else {
        removeTaskProgress(request.task.taskId);
      }
      syncVideoButtons();
      syncEmptyState();
      if (request.type === MessageType.TASK_COMPLETED) showCompletion(request.task);
      if (request.type === MessageType.TASK_ERROR && request.task.error !== "\u4E0B\u8F7D\u4EFB\u52A1\u5DF2\u53D6\u6D88") {
        showStatusMessage(request.task.error || "\u4E0B\u8F7D\u5931\u8D25", "error");
      }
    });
    await Promise.all([loadVideos(), loadTasks(), loadPageTitle()]);
    render();
  });
  async function loadVideos() {
    if (currentTabId === null) return;
    const version = ++videoLoadVersion;
    const response = await chrome.runtime.sendMessage({
      type: MessageType.GET_VIDEO_INFO,
      tabId: currentTabId
    }).catch(() => null);
    if (version === videoLoadVersion) videos = response?.videos || [];
  }
  async function loadTasks() {
    const response = await chrome.runtime.sendMessage({ type: MessageType.GET_TASKS }).catch(() => null);
    const restored = new Map((response?.tasks || []).map((task) => [task.taskId, task]));
    for (const task of currentTasks) restored.set(task.taskId, task);
    currentTasks = [...restored.values()].sort((left, right) => (right.createdAt || 0) - (left.createdAt || 0));
  }
  async function loadPageTitle() {
    if (currentTabId === null) return;
    const version = ++pageTitleLoadVersion;
    const pageInfo = await chrome.tabs.sendMessage(currentTabId, {
      type: MessageType.GET_PAGE_VIDEO_TITLE
    }).catch(() => null);
    if (version === pageTitleLoadVersion) currentPageTitle = normalizeVideoTitle(pageInfo?.title);
  }
  function upsertTask(task) {
    const index = currentTasks.findIndex((item) => item.taskId === task.taskId);
    if (index >= 0) currentTasks[index] = task;
    else currentTasks.unshift(task);
  }
  function getActiveTasks() {
    return currentTasks.filter((task) => ACTIVE_TASK_PHASES.has(task.phase));
  }
  function getSourceTask(sourceId) {
    return getActiveTasks().find((task) => task.tabId === currentTabId && task.sourceId === sourceId);
  }
  function render() {
    const list = document.getElementById("videoList");
    const renderedTaskIds = /* @__PURE__ */ new Set();
    list.replaceChildren();
    videos.forEach((video, index) => {
      list.appendChild(createVideoItem(video, index, renderedTaskIds));
    });
    for (const task of getActiveTasks()) {
      if (!renderedTaskIds.has(task.taskId)) list.appendChild(createDetachedTaskItem(task));
    }
    syncEmptyState();
  }
  function syncEmptyState() {
    const list = document.getElementById("videoList");
    const empty = list.children.length === 0;
    document.getElementById("emptyState").style.display = empty ? "block" : "none";
    list.style.display = empty ? "none" : "block";
  }
  function progressValue(task) {
    return Math.max(0, Math.min(100, Math.round(task.progress || 0)));
  }
  function createTaskProgress(task) {
    const progress = document.createElement("div");
    progress.className = "inline-task-progress";
    progress.dataset.taskId = task.taskId;
    const track = document.createElement("div");
    track.className = "inline-progress-track";
    const bar = document.createElement("div");
    bar.className = "inline-progress-bar";
    bar.dataset.taskBar = "";
    bar.style.width = `${progressValue(task)}%`;
    track.appendChild(bar);
    const footer = document.createElement("div");
    footer.className = "inline-progress-footer";
    const speed = document.createElement("span");
    speed.className = "inline-progress-speed";
    speed.dataset.taskSpeed = "";
    speed.textContent = formatSpeed(task.speed || 0);
    const actions = document.createElement("div");
    actions.className = "inline-progress-actions";
    const value = document.createElement("strong");
    value.className = "inline-progress-value";
    value.dataset.taskProgress = "";
    value.textContent = `${progressValue(task)}%`;
    const cancel = document.createElement("button");
    cancel.className = "inline-cancel-btn";
    cancel.textContent = message("cancelButton", null, "\u53D6\u6D88");
    cancel.addEventListener("click", () => cancelTask(task.taskId, cancel));
    actions.append(value, cancel);
    footer.append(speed, actions);
    progress.append(track, footer);
    return progress;
  }
  function patchTaskProgress(task) {
    const progress = document.querySelector(`[data-task-id="${CSS.escape(task.taskId)}"]`);
    if (!progress) return false;
    const value = progressValue(task);
    progress.querySelector("[data-task-bar]").style.width = `${value}%`;
    progress.querySelector("[data-task-progress]").textContent = `${value}%`;
    progress.querySelector("[data-task-speed]").textContent = formatSpeed(task.speed || 0);
    return true;
  }
  function attachTaskProgress(task) {
    if (!ACTIVE_TASK_PHASES.has(task.phase)) return;
    if (document.querySelector(`[data-task-id="${CSS.escape(task.taskId)}"]`)) return;
    const shell = task.tabId === currentTabId ? document.querySelector(`[data-stream-source-id="${CSS.escape(task.sourceId || "")}"]`) : null;
    if (shell) {
      shell.classList.add("has-task");
      shell.appendChild(createTaskProgress(task));
    } else {
      document.getElementById("videoList").appendChild(createDetachedTaskItem(task));
    }
  }
  function removeTaskProgress(taskId) {
    const progress = document.querySelector(`[data-task-id="${CSS.escape(taskId)}"]`);
    if (!progress) return;
    const detached = progress.closest(".detached-task-item");
    if (detached) {
      detached.remove();
      return;
    }
    const shell = progress.closest(".stream-shell");
    progress.remove();
    shell?.classList.remove("has-task");
  }
  async function cancelTask(taskId, button) {
    button.disabled = true;
    const response = await chrome.runtime.sendMessage({
      type: MessageType.CANCEL_TASK,
      taskId
    }).catch((error) => ({ success: false, error: error?.message || String(error) }));
    if (!response?.success) {
      button.disabled = false;
      showStatusMessage(response?.error || "\u53D6\u6D88\u4EFB\u52A1\u5931\u8D25", "error");
    }
  }
  function syncVideoButtons() {
    document.querySelectorAll("[data-source-id]").forEach((button) => {
      button.disabled = Boolean(getSourceTask(button.dataset.sourceId));
      button.textContent = message("downloadButton", null, "\u4E0B\u8F7D");
    });
  }
  function createVideoItem(video, videoIndex, renderedTaskIds) {
    const item = document.createElement("div");
    item.className = "video-item video-card";
    const header = document.createElement("div");
    header.className = "video-header";
    const title = document.createElement("div");
    title.className = "video-title";
    title.textContent = currentPageTitle || normalizeVideoTitle(video.title) || message("videoNumber", [(videoIndex + 1).toString()], `\u89C6\u9891 #${videoIndex + 1}`);
    title.title = title.textContent;
    const time = document.createElement("div");
    time.className = "video-time";
    time.textContent = video.duration ? formatDuration(video.duration) : new Date(video.timestamp).toLocaleTimeString();
    header.append(title, time);
    item.appendChild(header);
    if (video.unavailableReason && video.unavailableReason !== "dashProtected" && video.streams.length === 0) {
      const notice = document.createElement("div");
      notice.className = "bandwidth";
      notice.textContent = `${video.sourceType?.toUpperCase() || ""} \xB7 ${message(video.unavailableReason)}`;
      item.appendChild(notice);
    }
    video.streams.forEach((stream) => {
      const sourceId = createSourceId(video.baseUrl, stream.url);
      const shell = document.createElement("div");
      shell.className = "stream-shell";
      shell.dataset.streamSourceId = sourceId;
      const row = document.createElement("div");
      row.className = "stream-option";
      const info = document.createElement("div");
      info.className = "stream-info";
      const resolution = document.createElement("div");
      resolution.className = "resolution";
      resolution.append(document.createTextNode(stream.resolution || message("originalQuality", null, "\u539F\u59CB\u753B\u8D28")));
      const qualityBadge = document.createElement("span");
      qualityBadge.className = `quality-badge ${stream.height >= 1080 ? "quality-fhd" : stream.height >= 720 ? "quality-hd" : "quality-sd"}`;
      qualityBadge.textContent = stream.height >= 1080 ? message("qualityHigh", null, "\u9AD8\u6E05") : stream.height >= 720 ? message("qualityStandard", null, "\u6807\u6E05") : message("qualityLow", null, "\u4F4E\u6E05");
      if (stream.height > 0) resolution.appendChild(qualityBadge);
      const bandwidth = document.createElement("div");
      bandwidth.className = "bandwidth";
      const bitrate = stream.bandwidth ? `${(stream.bandwidth / 1e6).toFixed(2)} Mbps` : message("unknown", null, "\u672A\u77E5");
      const estimatedBytes = estimateMediaBytes(stream.bandwidth, video.duration);
      bandwidth.textContent = `${message("bitrate", null, "\u7801\u7387")}: ${bitrate}${estimatedBytes ? ` \xB7 ~${formatSize(estimatedBytes)}` : ""}`;
      info.append(resolution, bandwidth);
      if (stream.unavailableReason && stream.unavailableReason !== "dashProtected") {
        const notice = document.createElement("div");
        notice.className = "bandwidth";
        notice.textContent = message(stream.unavailableReason);
        info.appendChild(notice);
      }
      const button = document.createElement("button");
      button.className = "download-btn";
      button.dataset.sourceId = sourceId;
      button.textContent = message("downloadButton", null, "\u4E0B\u8F7D");
      button.disabled = Boolean(getSourceTask(sourceId));
      button.addEventListener("click", () => startDownload(video, stream, sourceId, button));
      row.append(info, button);
      shell.appendChild(row);
      const task = getSourceTask(sourceId);
      if (task) {
        shell.classList.add("has-task");
        shell.appendChild(createTaskProgress(task));
        renderedTaskIds.add(task.taskId);
      }
      item.appendChild(shell);
    });
    return item;
  }
  function createDetachedTaskItem(task) {
    const item = document.createElement("div");
    item.className = "video-item video-card detached-task-item";
    const header = document.createElement("div");
    header.className = "video-header compact-header";
    const title = document.createElement("div");
    title.className = "video-title";
    title.textContent = task.title || task.resolution;
    title.title = title.textContent;
    const resolution = document.createElement("div");
    resolution.className = "video-time";
    resolution.textContent = task.resolution;
    header.append(title, resolution);
    item.append(header, createTaskProgress(task));
    return item;
  }
  async function startDownload(video, stream, sourceId, button) {
    button.disabled = true;
    const pageInfo = await chrome.tabs.sendMessage(currentTabId, {
      type: MessageType.GET_PAGE_VIDEO_TITLE
    }).catch(() => null);
    const liveTitle = normalizeVideoTitle(pageInfo?.title);
    if (liveTitle) currentPageTitle = liveTitle;
    const response = await chrome.runtime.sendMessage({
      type: MessageType.DOWNLOAD_VIDEO,
      tabId: currentTabId,
      sourceId,
      data: {
        sourceType: video.sourceType || "hls",
        representationId: stream.representationId || null,
        audioRepresentationId: stream.audioRepresentationId || null,
        masterUrl: video.baseUrl,
        streamUrl: stream.url,
        audioUrl: stream.audioUrl || null,
        title: liveTitle || currentPageTitle || normalizeVideoTitle(video.title),
        resolution: stream.resolution || message("originalQuality", null, "\u539F\u59CB\u753B\u8D28"),
        width: stream.width,
        height: stream.height,
        bandwidth: stream.bandwidth,
        duration: video.duration,
        hasExternalAudio: stream.hasExternalAudio,
        sessionKeys: video.sessionKeys || []
      }
    }).catch((error) => ({ success: false, error: error?.message || String(error) }));
    if (!response?.success) {
      button.disabled = false;
      showStatusMessage(response?.error || "\u65E0\u6CD5\u521B\u5EFA\u4E0B\u8F7D\u4EFB\u52A1", "error");
      return;
    }
    upsertTask(response.task);
    attachTaskProgress(response.task);
    syncVideoButtons();
    syncEmptyState();
  }
  function showCompletion(task) {
    const suffix = task.actualFormat === "ts" ? `\uFF08MP4 \u4E0D\u517C\u5BB9\uFF0C\u5DF2\u4FDD\u5B58\u539F\u59CB TS\uFF1A${task.fallbackReason || "\u672A\u77E5\u539F\u56E0"}\uFF09` : "";
    showStatusMessage(
      `${message("downloadComplete", [task.filename || ""], "\u4E0B\u8F7D\u5B8C\u6210")} ${suffix}`,
      task.actualFormat === "ts" ? "warning" : "success"
    );
  }
  function showStatusMessage(text, type) {
    const element = document.getElementById("statusMessage");
    element.textContent = text;
    element.className = `status-message ${type}`;
    setTimeout(() => {
      if (element.textContent === text) element.className = "status-message";
    }, 8e3);
  }
  function formatSpeed(bytesPerSecond) {
    if (!bytesPerSecond) return "0 B/s";
    return `${formatSize(bytesPerSecond)}/s`;
  }
  function formatSize(bytes) {
    if (bytes < 1024) return `${Math.round(bytes)} B`;
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  }
  function formatDuration(seconds) {
    const total = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor(total % 3600 / 60);
    const remainder = total % 60;
    return [hours, minutes, remainder].map((value) => String(value).padStart(2, "0")).join(":");
  }
})();
