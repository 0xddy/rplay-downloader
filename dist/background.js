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
  function sanitizeFilename(value) {
    const cleaned = normalizeVideoTitle(value || "rplay").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/[. ]+$/g, "").trim();
    return [...cleaned || "rplay"].slice(0, 100).join("");
  }
  function makeDownloadFilename(task, extension) {
    const title = sanitizeFilename(task.title || "rplay");
    const resolution = sanitizeFilename(task.resolution || "video");
    const timestamp = new Date(task.createdAt).toISOString().replace(/[:.]/g, "-");
    return `${title}_${resolution}_${timestamp}.${extension}`;
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
  function canTransitionTask(from, to) {
    return from === to || TASK_TRANSITIONS.get(from)?.has(to) === true;
  }
  var MessageType = Object.freeze({
    GET_VIDEO_INFO: "GET_VIDEO_INFO",
    GET_TASKS: "GET_TASKS",
    GET_DOWNLOAD_STATE: "GET_DOWNLOAD_STATE",
    DOWNLOAD_VIDEO: "DOWNLOAD_VIDEO",
    CANCEL_TASK: "CANCEL_TASK",
    OPEN_POPUP: "OPEN_POPUP",
    VIDEO_DETECTED: "VIDEO_DETECTED",
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

  // src/task-store.js
  var PRIVATE_TASK_FIELDS = /* @__PURE__ */ new Set([
    "masterUrl",
    "streamUrl",
    "audioUrl",
    "objectUrl",
    "tempName",
    "sessionKeys"
  ]);
  function toPublicTask(task) {
    if (!task) return null;
    return Object.fromEntries(
      Object.entries(task).filter(([key]) => !PRIVATE_TASK_FIELDS.has(key))
    );
  }
  var TaskStore = class {
    constructor({ storageArea, storageKey, terminalPhases, onEvent = () => {
    }, now = Date.now }) {
      this.storageArea = storageArea;
      this.storageKey = storageKey;
      this.terminalPhases = terminalPhases;
      this.onEvent = onEvent;
      this.now = now;
      this.tasks = /* @__PURE__ */ new Map();
    }
    async restore() {
      const stored = await this.storageArea.get(this.storageKey);
      this.tasks.clear();
      for (const task of stored[this.storageKey] || []) this.tasks.set(task.taskId, task);
      return this.tasks;
    }
    get(taskId) {
      return this.tasks.get(taskId) || null;
    }
    values() {
      return this.tasks.values();
    }
    async add(task, eventType) {
      this.tasks.set(task.taskId, task);
      await this.persist();
      if (eventType) this.onEvent(eventType, task);
      return task;
    }
    async update(taskId, updates, {
      eventType,
      persist = true,
      validateTransition = true
    } = {}) {
      const task = this.get(taskId);
      if (!task) return null;
      if (validateTransition && updates.phase && !canTransitionTask(task.phase, updates.phase)) {
        throw new Error(`\u975E\u6CD5\u4EFB\u52A1\u72B6\u6001\u6D41\u8F6C\uFF1A${task.phase} \u2192 ${updates.phase}`);
      }
      Object.assign(task, updates, { updatedAt: this.now() });
      if (persist) await this.persist();
      if (eventType) this.onEvent(eventType, task);
      return task;
    }
    async persist() {
      const ordered = [...this.tasks.values()].sort((left, right) => right.createdAt - left.createdAt);
      const active = ordered.filter((task) => !this.terminalPhases.has(task.phase));
      const terminalLimit = Math.min(20, Math.max(0, 50 - active.length));
      const terminal = ordered.filter((task) => this.terminalPhases.has(task.phase)).slice(0, terminalLimit);
      const retained = [...active, ...terminal].sort((left, right) => right.createdAt - left.createdAt);
      const retainedIds = new Set(retained.map((task) => task.taskId));
      for (const taskId of this.tasks.keys()) {
        if (!retainedIds.has(taskId)) this.tasks.delete(taskId);
      }
      await this.storageArea.set({ [this.storageKey]: retained });
    }
  };

  // src/errors.js
  var ErrorKind = Object.freeze({
    SOURCE: "source",
    COMPATIBILITY: "compatibility",
    UNSUPPORTED: "unsupported",
    CANCELED: "canceled",
    INTERNAL: "internal"
  });

  // src/hls.js
  function resolveUrl(value, baseUrl) {
    if (!value) return null;
    try {
      return new URL(value, baseUrl).href;
    } catch {
      return value;
    }
  }
  function parseAttributeList(value) {
    const attributes = {};
    let index = 0;
    while (index < value.length) {
      while (value[index] === "," || /\s/.test(value[index] || "")) index++;
      const keyStart = index;
      while (index < value.length && value[index] !== "=") index++;
      if (index >= value.length) break;
      const key = value.slice(keyStart, index).trim().toUpperCase();
      index++;
      let parsedValue = "";
      if (value[index] === '"') {
        index++;
        const valueStart = index;
        while (index < value.length && value[index] !== '"') index++;
        parsedValue = value.slice(valueStart, index);
        index++;
      } else {
        const valueStart = index;
        while (index < value.length && value[index] !== ",") index++;
        parsedValue = value.slice(valueStart, index).trim();
      }
      if (key) attributes[key] = parsedValue;
      while (index < value.length && value[index] !== ",") index++;
      if (value[index] === ",") index++;
    }
    return attributes;
  }
  function parseMasterPlaylist(content, baseUrl) {
    const lines = content.split(/\r?\n/).map((line) => line.trim());
    const audioGroups = /* @__PURE__ */ new Map();
    const sessionKeys = [];
    for (const line of lines) {
      if (line.startsWith("#EXT-X-SESSION-KEY:")) {
        const attributes2 = parseAttributeList(line.slice(line.indexOf(":") + 1));
        sessionKeys.push({
          method: (attributes2.METHOD || "").toUpperCase(),
          uri: resolveUrl(attributes2.URI, baseUrl),
          iv: attributes2.IV || null,
          keyFormat: attributes2.KEYFORMAT || "identity"
        });
        continue;
      }
      if (!line.startsWith("#EXT-X-MEDIA:")) continue;
      const attributes = parseAttributeList(line.slice(line.indexOf(":") + 1));
      if (attributes.TYPE !== "AUDIO" || !attributes["GROUP-ID"]) continue;
      const group = audioGroups.get(attributes["GROUP-ID"]) || [];
      group.push({
        uri: resolveUrl(attributes.URI, baseUrl),
        language: attributes.LANGUAGE || null,
        name: attributes.NAME || null,
        isDefault: attributes.DEFAULT === "YES"
      });
      audioGroups.set(attributes["GROUP-ID"], group);
    }
    const streams = [];
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      if (!line.startsWith("#EXT-X-STREAM-INF:")) continue;
      const attributes = parseAttributeList(line.slice(line.indexOf(":") + 1));
      let uri = null;
      for (let next = index + 1; next < lines.length; next++) {
        if (!lines[next]) continue;
        if (!lines[next].startsWith("#")) uri = lines[next];
        break;
      }
      if (!uri) continue;
      const resolution = attributes.RESOLUTION || null;
      const [width, height] = resolution ? resolution.split("x").map((item) => Number.parseInt(item, 10)) : [null, null];
      const audioGroup = attributes.AUDIO || null;
      const externalAudioTracks = audioGroup ? (audioGroups.get(audioGroup) || []).filter((track) => Boolean(track.uri)) : [];
      const preferredAudio = externalAudioTracks.find((track) => track.isDefault) || externalAudioTracks[0] || null;
      streams.push({
        url: resolveUrl(uri, baseUrl),
        resolution,
        width,
        height,
        bandwidth: Number.parseInt(attributes.BANDWIDTH || attributes["AVERAGE-BANDWIDTH"] || "0", 10) || null,
        averageBandwidth: Number.parseInt(attributes["AVERAGE-BANDWIDTH"] || "0", 10) || null,
        codecs: attributes.CODECS || null,
        audioGroup,
        hasExternalAudio: externalAudioTracks.length > 0,
        audioUrl: preferredAudio?.uri || null
      });
    }
    return { streams, audioGroups, sessionKeys };
  }
  function getPlaylistDuration(content) {
    let duration = 0;
    for (const match of content.matchAll(/#EXTINF:([\d.]+)/g)) {
      duration += Number.parseFloat(match[1]);
    }
    return Number.isFinite(duration) && duration > 0 ? duration : null;
  }

  // src/video-detector.js
  var MASTER_URL_PATTERNS = [
    /^https:\/\/api\.rplay\.live\/content\/hlsstream\?.*media\/hls\/master\.m3u8.*$/,
    /^https:\/\/api\.rplay-cdn\.com\/content\/hlsstream\?s3key=.*(?<!playlist|_hls)\.m3u8.*$/,
    /^https:\/\/api2\.rplay\.live\/content\/hlsstream\?.*s3key=.*\.m3u8.*$/
  ];
  function isRPlayMasterUrl(url) {
    return MASTER_URL_PATTERNS.some((pattern) => pattern.test(url));
  }
  async function inspectVideoSource(masterUrl, {
    fetchFn,
    resolveTitle = async () => "",
    now = Date.now
  }) {
    const response = await fetchFn(masterUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const content = await response.text();
    const { streams, sessionKeys } = parseMasterPlaylist(content, masterUrl);
    if (streams.length === 0) return null;
    let duration = null;
    try {
      const mediaResponse = await fetchFn(streams[0].url);
      if (mediaResponse.ok) duration = getPlaylistDuration(await mediaResponse.text());
    } catch {
    }
    let title = "";
    try {
      title = normalizeVideoTitle(await resolveTitle());
    } catch {
    }
    return {
      streams,
      sessionKeys,
      baseUrl: masterUrl,
      duration,
      title: title || "rplay",
      timestamp: now()
    };
  }

  // src/background.js
  var URL_CACHE_DURATION = 3e3;
  var CANCEL_CLEANUP_TIMEOUT = 8e3;
  var TASKS_STORAGE_KEY = "rplayDownloadTasksV2";
  var VIDEO_STORAGE_PREFIX = "rplayVideos:";
  var videoInfo = /* @__PURE__ */ new Map();
  var processedUrls = /* @__PURE__ */ new Map();
  var queue = [];
  var pendingDownloads = /* @__PURE__ */ new Map();
  var pendingFilenamesByUrl = /* @__PURE__ */ new Map();
  var activeTaskId = null;
  var offscreenCreation = null;
  var processingQueue = false;
  var taskStore = new TaskStore({
    storageArea: chrome.storage.session,
    storageKey: TASKS_STORAGE_KEY,
    terminalPhases: TERMINAL_TASK_PHASES,
    onEvent(eventType, task) {
      broadcast({ type: eventType, task: toPublicTask(task), tabId: task.tabId });
    }
  });
  var { tasks } = taskStore;
  var bootstrapPromise = bootstrap();
  function shouldProcessUrl(tabId, url) {
    const key = `${tabId}:${url}`;
    const now = Date.now();
    const previous = processedUrls.get(key);
    if (previous && now - previous < URL_CACHE_DURATION) return false;
    processedUrls.set(key, now);
    return true;
  }
  function createTaskId() {
    return `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
  }
  async function persistTasks() {
    await taskStore.persist();
  }
  async function updateTask(taskId, updates, eventType = MessageType.TASK_UPDATED, options = {}) {
    return taskStore.update(taskId, updates, { eventType, ...options });
  }
  function broadcast(message) {
    chrome.runtime.sendMessage(message).catch(() => {
    });
    if (Number.isInteger(message.tabId) && message.tabId >= 0) {
      chrome.tabs.sendMessage(message.tabId, message).catch(() => {
      });
    }
  }
  async function updateBadge(text, color, tabId) {
    const options = Number.isInteger(tabId) && tabId >= 0 ? { tabId } : {};
    await Promise.all([
      chrome.action.setBadgeText({ ...options, text }).catch(() => {
      }),
      chrome.action.setBadgeBackgroundColor({ ...options, color }).catch(() => {
      })
    ]);
  }
  async function resolvePageTitle(tabId) {
    try {
      const page = await chrome.tabs.sendMessage(tabId, { type: MessageType.GET_PAGE_VIDEO_TITLE });
      const title = normalizeVideoTitle(page?.title);
      if (title) return title;
    } catch {
    }
    try {
      return normalizeVideoTitle((await chrome.tabs.get(tabId)).title);
    } catch {
      return "";
    }
  }
  async function bootstrap() {
    await taskStore.restore();
    let migrated = false;
    for (const task of tasks.values()) {
      if (!task.sourceId && task.masterUrl && task.streamUrl) {
        task.sourceId = createSourceId(task.masterUrl, task.streamUrl);
        delete task.selectionId;
        migrated = true;
      }
    }
    if (migrated) await persistTasks();
    const nonTerminal = [...tasks.values()].filter((task) => !TERMINAL_TASK_PHASES.has(task.phase));
    if (nonTerminal.length === 0) return;
    const saving = nonTerminal.find((task) => task.phase === TaskPhase.SAVING && Number.isInteger(task.browserDownloadId));
    if (saving) {
      const [download] = await chrome.downloads.search({ id: saving.browserDownloadId }).catch(() => []);
      if (download?.state === "in_progress") {
        activeTaskId = saving.taskId;
        pendingDownloads.set(saving.browserDownloadId, saving.taskId);
        return;
      }
      if (download?.state === "complete") {
        await finishTask(saving.taskId);
        return;
      }
      if (download?.state === "interrupted") {
        await failTask(saving.taskId, "\u6D4F\u89C8\u5668\u4FDD\u5B58\u5DF2\u4E2D\u65AD");
        return;
      }
    }
    const context = await getOffscreenContext();
    if (context) {
      const status = await chrome.runtime.sendMessage({ type: MessageType.OFFSCREEN_STATUS }).catch(() => null);
      if (status?.activeTaskId && tasks.has(status.activeTaskId)) {
        activeTaskId = status.activeTaskId;
        if (status.fileReady) void beginBrowserDownload(status.activeTaskId, status.fileReady);
        return;
      }
    }
    for (const task of nonTerminal) {
      task.phase = TaskPhase.QUEUED;
      task.message = "\u6269\u5C55\u540E\u53F0\u5DF2\u6062\u590D\uFF0C\u7B49\u5F85\u91CD\u65B0\u5F00\u59CB";
      task.progress = 0;
      task.browserDownloadId = null;
      task.objectUrl = null;
      task.tempName = null;
      queue.push(task.taskId);
    }
    queue.sort((left, right) => tasks.get(left).createdAt - tasks.get(right).createdAt);
    await persistTasks();
    void processQueue();
  }
  async function getOffscreenContext() {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
      documentUrls: [chrome.runtime.getURL("offscreen.html")]
    });
    return contexts[0] || null;
  }
  async function ensureOffscreen() {
    if (await getOffscreenContext()) return;
    if (!offscreenCreation) {
      offscreenCreation = chrome.offscreen.createDocument({
        url: "offscreen.html",
        reasons: ["BLOBS"],
        justification: "\u5728\u9875\u9762\u5173\u95ED\u540E\u7EE7\u7EED HLS \u4E0B\u8F7D\u3001\u5199\u5165 OPFS\uFF0C\u5E76\u4E3A\u6D4F\u89C8\u5668\u4E0B\u8F7D\u521B\u5EFA\u4E34\u65F6 Blob URL\u3002"
      }).finally(() => {
        offscreenCreation = null;
      });
    }
    await offscreenCreation;
  }
  async function sendToOffscreen(message) {
    await ensureOffscreen();
    let response = await chrome.runtime.sendMessage(message).catch(() => null);
    if (!response) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      response = await chrome.runtime.sendMessage(message);
    }
    return response;
  }
  async function createDownloadTask(request) {
    await bootstrapPromise;
    const data = request.data || {};
    if (!data.masterUrl || !data.streamUrl || !data.resolution) {
      throw new Error("\u4E0B\u8F7D\u53C2\u6570\u4E0D\u5B8C\u6574\uFF0C\u8BF7\u5237\u65B0\u9875\u9762\u540E\u91CD\u8BD5");
    }
    let title = normalizeVideoTitle(data.title);
    if (!title) {
      try {
        const tab = await chrome.tabs.get(request.tabId);
        title = normalizeVideoTitle(tab.title);
      } catch {
      }
    }
    title ||= "rplay";
    const taskId = createTaskId();
    const now = Date.now();
    const bandwidth = Number(data.bandwidth) || null;
    const duration = Number(data.duration) || null;
    const estimatedBytes = estimateMediaBytes(bandwidth, duration);
    const sourceId = createSourceId(data.masterUrl, data.streamUrl);
    const duplicate = [...tasks.values()].find((task2) => task2.tabId === request.tabId && task2.sourceId === sourceId && ACTIVE_TASK_PHASES.has(task2.phase));
    if (duplicate) return toPublicTask(duplicate);
    const task = {
      taskId,
      tabId: request.tabId,
      sourceId,
      // Filename sanitizing is applied later, only at the download boundary.
      title,
      resolution: data.resolution,
      width: Number(data.width) || Number.parseInt(data.resolution.split("x")[0], 10) || null,
      height: Number(data.height) || Number.parseInt(data.resolution.split("x")[1], 10) || null,
      bandwidth,
      duration,
      estimatedBytes,
      masterUrl: data.masterUrl,
      streamUrl: data.streamUrl,
      audioUrl: data.audioUrl || null,
      hasExternalAudio: Boolean(data.hasExternalAudio),
      sessionKeys: Array.isArray(data.sessionKeys) ? data.sessionKeys : [],
      requestedFormat: "mp4",
      actualFormat: null,
      phase: TaskPhase.QUEUED,
      downloadedBytes: 0,
      totalBytes: estimatedBytes,
      speed: 0,
      progress: 0,
      fallbackReason: null,
      error: null,
      message: "\u7B49\u5F85\u540E\u53F0\u4E0B\u8F7D",
      filename: null,
      browserDownloadId: null,
      objectUrl: null,
      tempName: null,
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      completedAt: null
    };
    queue.push(taskId);
    await taskStore.add(task, MessageType.TASK_CREATED);
    void processQueue();
    return toPublicTask(task);
  }
  async function processQueue() {
    await bootstrapPromise;
    if (processingQueue || activeTaskId) return;
    processingQueue = true;
    try {
      while (!activeTaskId && queue.length > 0) {
        const taskId = queue.shift();
        const task = tasks.get(taskId);
        if (!task || task.phase !== TaskPhase.QUEUED) continue;
        activeTaskId = taskId;
        await updateTask(taskId, {
          phase: TaskPhase.PREPARING,
          message: "\u6B63\u5728\u51C6\u5907\u540E\u53F0\u4E0B\u8F7D\u2026",
          startedAt: task.startedAt || Date.now(),
          error: null
        });
        await updateBadge("\u2193", "#007bff", task.tabId);
        try {
          const response = await sendToOffscreen({ type: MessageType.OFFSCREEN_START, task });
          if (!response?.accepted) throw new Error(response?.error || "Offscreen \u4E0B\u8F7D\u5668\u672A\u63A5\u53D7\u4EFB\u52A1");
        } catch (error) {
          await failTask(taskId, error?.message || String(error));
        }
      }
    } finally {
      processingQueue = false;
    }
  }
  async function beginBrowserDownload(taskId, fileReady) {
    const task = tasks.get(taskId);
    if (!task || TERMINAL_TASK_PHASES.has(task.phase) || task.browserDownloadId) return;
    const filename = makeDownloadFilename(task, fileReady.actualFormat);
    await updateTask(taskId, {
      phase: TaskPhase.SAVING,
      actualFormat: fileReady.actualFormat,
      filename,
      downloadedBytes: fileReady.size || task.downloadedBytes,
      totalBytes: fileReady.size || task.totalBytes,
      progress: 98,
      message: fileReady.actualFormat === "ts" ? "MP4 \u5C01\u88C5\u5931\u8D25\uFF0C\u6B63\u5728\u4FDD\u5B58\u539F\u59CB TS\u2026" : "\u6B63\u5728\u4FDD\u5B58 MP4\u2026",
      objectUrl: fileReady.objectUrl,
      tempName: fileReady.tempName,
      fallbackReason: fileReady.fallbackReason || task.fallbackReason
    });
    pendingFilenamesByUrl.set(fileReady.objectUrl, filename);
    try {
      const downloadId = await chrome.downloads.download({
        url: fileReady.objectUrl,
        filename,
        saveAs: true,
        conflictAction: "uniquify"
      });
      const current = tasks.get(taskId);
      if (!current || current.phase !== TaskPhase.SAVING) {
        await chrome.downloads.cancel(downloadId).catch(() => {
        });
        return;
      }
      pendingDownloads.set(downloadId, taskId);
      await updateTask(taskId, { browserDownloadId: downloadId });
    } catch (error) {
      pendingFilenamesByUrl.delete(fileReady.objectUrl);
      await failTask(taskId, error?.message || "\u7528\u6237\u53D6\u6D88\u4FDD\u5B58");
    }
  }
  async function releaseTaskFile(task) {
    if (!task?.objectUrl && !task?.tempName) return;
    await sendToOffscreen({
      type: MessageType.OFFSCREEN_RELEASE_FILE,
      taskId: task.taskId,
      objectUrl: task.objectUrl,
      tempName: task.tempName
    }).catch(() => {
    });
  }
  async function finishTask(taskId) {
    const task = tasks.get(taskId);
    if (!task || task.phase === TaskPhase.COMPLETED) return;
    if (task.browserDownloadId) pendingDownloads.delete(task.browserDownloadId);
    await releaseTaskFile(task);
    const completedAt = Date.now();
    const elapsedSeconds = Math.max(1e-3, (completedAt - (task.startedAt || task.createdAt)) / 1e3);
    await updateTask(taskId, {
      phase: TaskPhase.COMPLETED,
      progress: 100,
      speed: 0,
      message: task.actualFormat === "ts" ? "\u539F\u59CB TS \u4E0B\u8F7D\u5B8C\u6210" : "MP4 \u4E0B\u8F7D\u5B8C\u6210",
      completedAt,
      totalTime: elapsedSeconds,
      avgSpeed: task.downloadedBytes / elapsedSeconds,
      objectUrl: null,
      tempName: null
    }, MessageType.TASK_COMPLETED);
    await updateBadge("\u2713", "#28a745", task.tabId);
    activeTaskId = null;
    setTimeout(() => updateBadge(String(videoInfo.get(task.tabId)?.length || ""), "#666666", task.tabId), 3e3);
    void processQueue();
  }
  function releaseTaskSlot(taskId) {
    if (activeTaskId !== taskId) return;
    activeTaskId = null;
    void processQueue();
  }
  function scheduleCanceledTaskCleanup(taskId) {
    setTimeout(async () => {
      if (activeTaskId !== taskId) return;
      await chrome.offscreen.closeDocument().catch(() => {
      });
      releaseTaskSlot(taskId);
    }, CANCEL_CLEANUP_TIMEOUT);
  }
  async function failTask(taskId, message, { releaseSlot = true } = {}) {
    const task = tasks.get(taskId);
    if (!task) return;
    if (TERMINAL_TASK_PHASES.has(task.phase)) {
      if (releaseSlot) releaseTaskSlot(taskId);
      return;
    }
    if (task.browserDownloadId) pendingDownloads.delete(task.browserDownloadId);
    await releaseTaskFile(task);
    await updateTask(taskId, {
      phase: TaskPhase.ERROR,
      error: message || "\u4E0B\u8F7D\u5931\u8D25",
      message: message || "\u4E0B\u8F7D\u5931\u8D25",
      speed: 0,
      completedAt: Date.now(),
      objectUrl: null,
      tempName: null
    }, MessageType.TASK_ERROR);
    await updateBadge("\u2717", "#dc3545", task.tabId);
    if (releaseSlot) releaseTaskSlot(taskId);
    setTimeout(() => updateBadge(String(videoInfo.get(task.tabId)?.length || ""), "#666666", task.tabId), 3e3);
  }
  async function cancelTask(taskId) {
    await bootstrapPromise;
    const task = tasks.get(taskId);
    if (!task || TERMINAL_TASK_PHASES.has(task.phase)) return false;
    if (task.phase === TaskPhase.QUEUED) {
      const index = queue.indexOf(taskId);
      if (index >= 0) queue.splice(index, 1);
      await failTask(taskId, "\u4E0B\u8F7D\u4EFB\u52A1\u5DF2\u53D6\u6D88");
      return true;
    }
    if (task.phase === TaskPhase.SAVING) {
      if (task.browserDownloadId) await chrome.downloads.cancel(task.browserDownloadId).catch(() => {
      });
      await sendToOffscreen({ type: MessageType.OFFSCREEN_CANCEL, taskId }).catch(() => {
      });
      await failTask(taskId, "\u4E0B\u8F7D\u4EFB\u52A1\u5DF2\u53D6\u6D88");
      return true;
    }
    await failTask(taskId, "\u4E0B\u8F7D\u4EFB\u52A1\u5DF2\u53D6\u6D88", { releaseSlot: false });
    const response = await sendToOffscreen({
      type: MessageType.OFFSCREEN_CANCEL,
      taskId
    }).catch(() => null);
    if (!response?.success) releaseTaskSlot(taskId);
    else scheduleCanceledTaskCleanup(taskId);
    return true;
  }
  async function handleMessage(request) {
    await bootstrapPromise;
    switch (request.type) {
      case MessageType.GET_VIDEO_INFO: {
        const tabId = request.tabId;
        if (videoInfo.has(tabId)) return { videos: videoInfo.get(tabId) };
        const key = `${VIDEO_STORAGE_PREFIX}${tabId}`;
        const stored = await chrome.storage.local.get(key);
        const videos = stored[key] || [];
        videoInfo.set(tabId, videos);
        return { videos };
      }
      case MessageType.GET_TASKS:
        return {
          tasks: [...tasks.values()].sort((left, right) => right.createdAt - left.createdAt).map(toPublicTask),
          activeTaskId
        };
      case MessageType.GET_DOWNLOAD_STATE: {
        const state = [...tasks.values()].filter((task) => task.tabId === request.tabId && !TERMINAL_TASK_PHASES.has(task.phase)).sort((left, right) => right.createdAt - left.createdAt)[0];
        return { state: toPublicTask(state) };
      }
      case MessageType.DOWNLOAD_VIDEO:
        return { success: true, task: await createDownloadTask(request) };
      case MessageType.CANCEL_TASK:
        return { success: await cancelTask(request.taskId) };
      case MessageType.OPEN_POPUP:
        if (chrome.action.openPopup) await chrome.action.openPopup().catch(() => {
        });
        return { success: true };
      case MessageType.OFFSCREEN_PROGRESS: {
        const task = tasks.get(request.taskId);
        if (!task || TERMINAL_TASK_PHASES.has(task.phase)) return { accepted: false };
        const allowed = request.updates || {};
        const nextPhase = allowed.phase || task.phase;
        const phaseChanged = nextPhase !== task.phase;
        await updateTask(request.taskId, {
          phase: nextPhase,
          actualFormat: allowed.actualFormat ?? task.actualFormat,
          downloadedBytes: Number.isFinite(allowed.downloadedBytes) ? allowed.downloadedBytes : task.downloadedBytes,
          totalBytes: Number.isFinite(allowed.totalBytes) ? allowed.totalBytes : task.totalBytes,
          speed: Number.isFinite(allowed.speed) ? allowed.speed : task.speed,
          progress: Number.isFinite(allowed.progress) ? Math.max(0, Math.min(99, allowed.progress)) : task.progress,
          fallbackReason: allowed.fallbackReason ?? task.fallbackReason,
          message: allowed.message || task.message
        }, MessageType.TASK_UPDATED, { persist: phaseChanged });
        return { accepted: true };
      }
      case MessageType.OFFSCREEN_FILE_READY:
        void beginBrowserDownload(request.taskId, request.file);
        return { accepted: true };
      case MessageType.OFFSCREEN_ERROR:
        await failTask(request.taskId, request.error || "\u540E\u53F0\u4E0B\u8F7D\u5931\u8D25");
        return { accepted: true };
      case MessageType.OFFSCREEN_CANCELED:
        await failTask(request.taskId, "\u4E0B\u8F7D\u4EFB\u52A1\u5DF2\u53D6\u6D88");
        return { accepted: true };
      default:
        return null;
    }
  }
  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (!BACKGROUND_MESSAGE_TYPES.has(request?.type)) return false;
    handleMessage(request).then((response) => sendResponse(response)).catch((error) => sendResponse({ success: false, error: error?.message || String(error) }));
    return true;
  });
  chrome.downloads.onDeterminingFilename.addListener((downloadItem, suggest) => {
    const url = downloadItem.finalUrl || downloadItem.url;
    const filename = pendingFilenamesByUrl.get(url) || pendingFilenamesByUrl.get(downloadItem.url);
    if (!filename) {
      suggest();
      return;
    }
    pendingFilenamesByUrl.delete(url);
    pendingFilenamesByUrl.delete(downloadItem.url);
    suggest({ filename, conflictAction: "uniquify" });
  });
  chrome.downloads.onChanged.addListener((delta) => {
    if (!delta.state) return;
    const taskId = pendingDownloads.get(delta.id) || [...tasks.values()].find((task) => task.browserDownloadId === delta.id)?.taskId;
    if (!taskId) return;
    if (delta.state.current === "complete") void finishTask(taskId);
    if (delta.state.current === "interrupted") void failTask(taskId, "\u6D4F\u89C8\u5668\u4FDD\u5B58\u5DF2\u53D6\u6D88\u6216\u4E2D\u65AD");
  });
  chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
      const { url, tabId, type } = details;
      if (!Number.isInteger(tabId) || tabId < 0) return;
      if (type !== "xmlhttprequest" && type !== "other") return;
      if (!isRPlayMasterUrl(url) || !shouldProcessUrl(tabId, url)) return;
      setTimeout(async () => {
        try {
          const detected = await inspectVideoSource(url, {
            fetchFn: (input) => fetch(input, { credentials: "include" }),
            resolveTitle: () => resolvePageTitle(tabId),
            now: Date.now
          });
          if (!detected) return;
          const list = videoInfo.get(tabId) || [];
          if (list.some((video) => video.baseUrl === url)) return;
          list.push(detected);
          videoInfo.set(tabId, list);
          await chrome.storage.local.set({ [`${VIDEO_STORAGE_PREFIX}${tabId}`]: list });
          await updateBadge(String(list.length), "#666666", tabId);
          chrome.tabs.sendMessage(tabId, { type: MessageType.VIDEO_DETECTED, data: detected }).catch(() => {
          });
        } catch (error) {
          console.error("[RPlay] \u68C0\u6D4B HLS \u5931\u8D25:", error);
        }
      }, 500);
    },
    { urls: ["*://*.rplay-cdn.com/*", "*://*.rplay.live/*"] }
  );
  chrome.tabs.onRemoved.addListener((tabId) => {
    videoInfo.delete(tabId);
    chrome.storage.local.remove(`${VIDEO_STORAGE_PREFIX}${tabId}`).catch(() => {
    });
  });
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (!changeInfo.url) return;
    videoInfo.delete(tabId);
    chrome.storage.local.remove(`${VIDEO_STORAGE_PREFIX}${tabId}`).catch(() => {
    });
  });
  setInterval(() => {
    const cutoff = Date.now() - 6e4;
    for (const [key, timestamp] of processedUrls) {
      if (timestamp < cutoff) processedUrls.delete(key);
    }
  }, 6e4);
  console.log("RPlay Video Downloader background v2 loaded");
})();
