(() => {
  // src/naming.js
  function normalizeVideoTitle(value) {
    return String(value || "").normalize("NFC").replace(/\s+/g, " ").replace(/\s*[|｜]\s*RPLAY\s*$/i, "").trim();
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

  // content.js
  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.type === MessageType.VIDEO_DETECTED) showVideoNotification(request.data);
    if (request.type === MessageType.GET_PAGE_VIDEO_TITLE) {
      sendResponse({ title: extractVideoTitle() });
    }
  });
  function extractVideoTitle() {
    const heading = document.querySelector("h2.font-weight-bold.text-body-lg");
    const openGraph = document.querySelector('meta[property="og:title"]');
    const twitter = document.querySelector('meta[name="twitter:title"]');
    return normalizeVideoTitle(
      heading?.textContent || openGraph?.getAttribute("content") || twitter?.getAttribute("content") || document.title
    );
  }
  function ensureStyles() {
    if (document.getElementById("rplay-downloader-styles")) return;
    const style = document.createElement("style");
    style.id = "rplay-downloader-styles";
    style.textContent = `
    @keyframes slideInFromRight {
      from { transform: translateX(400px); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }

    #rplay-video-notification {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10000;
      display: flex;
      align-items: center;
      gap: 12px;
      max-width: 320px;
      padding: 16px 20px;
      border: 2px solid #0099ff;
      border-radius: 12px;
      color: #1e293b;
      background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
      box-shadow: 0 8px 30px rgba(0, 153, 255, 0.25), 0 2px 8px rgba(0, 0, 0, 0.1);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      cursor: pointer;
      transition: all 0.3s;
      backdrop-filter: blur(10px);
      animation: slideInFromRight 0.5s cubic-bezier(0.4, 0, 0.2, 1);
    }

    #rplay-video-notification:hover {
      transform: scale(1.05) translateY(-2px);
      border-color: #0066cc;
      box-shadow: 0 12px 35px rgba(0, 153, 255, 0.35), 0 4px 12px rgba(0, 0, 0, 0.12);
    }

    #rplay-video-notification .rplay-icon {
      display: grid;
      flex: none;
      width: 40px;
      height: 40px;
      place-items: center;
      border-radius: 50%;
      color: white;
      background: linear-gradient(135deg, #0099ff 0%, #0066cc 100%);
      box-shadow: 0 3px 10px rgba(0, 153, 255, 0.35);
    }

    #rplay-video-notification .rplay-icon svg {
      width: 20px;
      height: 20px;
    }

    #rplay-video-notification strong {
      display: block;
      margin-bottom: 3px;
      color: #0099ff;
      font-size: 15px;
      font-weight: 700;
    }

    #rplay-video-notification span {
      color: #64748b;
      font-size: 12px;
      line-height: 1.4;
    }
  `;
    (document.head || document.documentElement).appendChild(style);
  }
  function showVideoNotification(videoData) {
    ensureStyles();
    document.getElementById("rplay-video-notification")?.remove();
    const notification = document.createElement("div");
    notification.id = "rplay-video-notification";
    notification.setAttribute("role", "button");
    notification.setAttribute("tabindex", "0");
    const icon = document.createElement("div");
    icon.className = "rplay-icon";
    icon.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <polygon points="9 7 17 12 9 17" fill="currentColor"></polygon>
    </svg>
  `;
    const copy = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = chrome.i18n.getMessage("videoDetected") || "\u68C0\u6D4B\u5230\u53EF\u4E0B\u8F7D\u89C6\u9891";
    const detail = document.createElement("span");
    detail.textContent = chrome.i18n.getMessage("streamsFound", [String(videoData.streams.length)]) || `\u627E\u5230 ${videoData.streams.length} \u4E2A\u6E05\u6670\u5EA6\u9009\u9879`;
    copy.append(title, detail);
    notification.append(icon, copy);
    const openPopup = () => chrome.runtime.sendMessage({ type: MessageType.OPEN_POPUP }).catch(() => {
    });
    notification.addEventListener("click", openPopup);
    notification.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") openPopup();
    });
    (document.body || document.documentElement).appendChild(notification);
    setTimeout(() => notification.remove(), 5e3);
  }
  console.log("RPlay Video Downloader content v2 loaded");
})();
