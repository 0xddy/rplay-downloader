import { createSourceId, estimateMediaBytes } from './media.js';
import { LICENSE_STORAGE_PREFIX, isWidevineLicenseUrl } from './cdm-client.js';
import { makeDownloadFilename, normalizeVideoTitle } from './naming.js';
import {
  ACTIVE_TASK_PHASES,
  BACKGROUND_MESSAGE_TYPES,
  MessageType,
  TERMINAL_TASK_PHASES,
  TaskPhase,
} from './protocol.js';
import { TaskStore, toPublicTask } from './task-store.js';
import {
  coalesceCmafObservations,
  getRPlaySourceType,
  inspectVideoSource,
  isCmafTrackOnlySource,
  isKnownVideoSource,
  mergeVideoSources,
  shouldInspectMediaRequest,
} from './video-detector.js';

const URL_CACHE_DURATION = 3_000;
const CANCEL_CLEANUP_TIMEOUT = 8_000;
const TASKS_STORAGE_KEY = 'rplayDownloadTasksV2';
const VIDEO_STORAGE_PREFIX = 'rplayVideos:';
const videoInfo = new Map();
const processedUrls = new Map();
const detectionContexts = new Map();
const detectionStorageWrites = new Map();
const cmafTitleRequests = new Map();
const queue = [];
const pendingDownloads = new Map();
const pendingFilenamesByUrl = new Map();
let activeTaskId = null;
let offscreenCreation = null;
let processingQueue = false;

const taskStore = new TaskStore({
  storageArea: chrome.storage.session,
  storageKey: TASKS_STORAGE_KEY,
  terminalPhases: TERMINAL_TASK_PHASES,
  onEvent(eventType, task) {
    broadcast({ type: eventType, task: toPublicTask(task), tabId: task.tabId });
  },
});
const { tasks } = taskStore;

const bootstrapPromise = bootstrap();

function shouldProcessUrl(tabId, url) {
  const key = `${tabId}:${url}`;
  const now = Date.now();
  const previous = processedUrls.get(key);
  if (previous && now - previous < URL_CACHE_DURATION) return false;
  processedUrls.set(key, now);
  return true;
}

function getDetectionContext(tabId) {
  if (!detectionContexts.has(tabId)) detectionContexts.set(tabId, Symbol());
  return detectionContexts.get(tabId);
}

function getDetectedVideos(tabId) {
  const videos = videoInfo.get(tabId) || [];
  const normalized = coalesceCmafObservations(videos);
  if (normalized !== videos) videoInfo.set(tabId, normalized);
  return normalized;
}

function resolveCmafPageTitle(tabId, context) {
  const notice = getDetectedVideos(tabId).find(isCmafTrackOnlySource);
  if (notice) return Promise.resolve(notice.title);
  const pending = cmafTitleRequests.get(tabId);
  if (pending?.context === context) return pending.promise;
  // Concurrent first segments share one page-title request. Subsequent ones
  // keep the notice's original title rather than probing the page every time.
  const promise = resolvePageTitle(tabId);
  cmafTitleRequests.set(tabId, { context, promise });
  return promise;
}

function writeDetectionStorage(tabId, write) {
  // A storage write already in flight cannot be canceled. Keep navigation
  // cleanup behind it, and new-page writes behind that cleanup.
  const previous = detectionStorageWrites.get(tabId);
  const pending = previous ? previous.catch(() => {}).then(write) : Promise.resolve(write());
  detectionStorageWrites.set(tabId, pending);
  pending.finally(() => {
    if (detectionStorageWrites.get(tabId) === pending) detectionStorageWrites.delete(tabId);
  }).catch(() => {});
  return pending;
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
  chrome.runtime.sendMessage(message).catch(() => {});
  if (Number.isInteger(message.tabId) && message.tabId >= 0) {
    chrome.tabs.sendMessage(message.tabId, message).catch(() => {});
  }
}

async function updateBadge(text, color, tabId) {
  const options = Number.isInteger(tabId) && tabId >= 0 ? { tabId } : {};
  await Promise.all([
    chrome.action.setBadgeText({ ...options, text }).catch(() => {}),
    chrome.action.setBadgeBackgroundColor({ ...options, color }).catch(() => {}),
  ]);
}

async function resolvePageTitle(tabId) {
  try {
    const page = await chrome.tabs.sendMessage(tabId, { type: MessageType.GET_PAGE_VIDEO_TITLE });
    const title = normalizeVideoTitle(page?.title);
    if (title) return title;
  } catch {
    // Content Script may not be ready; fall back to the tab title.
  }
  try {
    return normalizeVideoTitle((await chrome.tabs.get(tabId)).title);
  } catch {
    return '';
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
    if (download?.state === 'in_progress') {
      activeTaskId = saving.taskId;
      pendingDownloads.set(saving.browserDownloadId, saving.taskId);
      return;
    }
    if (download?.state === 'complete') {
      await finishTask(saving.taskId);
      return;
    }
    if (download?.state === 'interrupted') {
      await failTask(saving.taskId, '浏览器保存已中断');
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
    task.message = '扩展后台已恢复，等待重新开始';
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
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL('offscreen.html')],
  });
  return contexts[0] || null;
}

async function ensureOffscreen() {
  if (await getOffscreenContext()) return;
  if (!offscreenCreation) {
    offscreenCreation = chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['BLOBS'],
      justification: '在页面关闭后继续 HLS 下载、写入 OPFS，并为浏览器下载创建临时 Blob URL。',
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
  const detectedVideo = (videoInfo.get(request.tabId) || []).find((video) => video.baseUrl === data.masterUrl);
  const detectedStream = detectedVideo?.streams.find((stream) => stream.url === data.streamUrl);
  // Let selected streams enter the worker, which validates the current manifest.
  if (detectedVideo?.unavailableReason && !detectedStream) {
    throw new Error('已识别到媒体，但当前扩展不支持下载此来源');
  }
  if (!data.masterUrl || !data.streamUrl || !data.resolution) {
    throw new Error('下载参数不完整，请刷新页面后重试');
  }

  let title = normalizeVideoTitle(data.title);
  if (!title) {
    try {
      const tab = await chrome.tabs.get(request.tabId);
      title = normalizeVideoTitle(tab.title);
    } catch {
      // 来源页面可能已经关闭，使用默认标题。
    }
  }
  title ||= 'rplay';

  const taskId = createTaskId();
  const now = Date.now();
  const bandwidth = Number(data.bandwidth) || null;
  const duration = Number(data.duration) || null;
  const estimatedBytes = estimateMediaBytes(bandwidth, duration);
  const sourceId = createSourceId(data.masterUrl, data.streamUrl);
  const duplicate = [...tasks.values()].find((task) => (
    task.tabId === request.tabId
    && task.sourceId === sourceId
    && ACTIVE_TASK_PHASES.has(task.phase)
  ));
  if (duplicate) return toPublicTask(duplicate);
  const licenseKey = `${LICENSE_STORAGE_PREFIX}${request.tabId}`;
  await detectionStorageWrites.get(request.tabId)?.catch(() => {});
  const licenseUrl = (await chrome.storage.session.get(licenseKey))[licenseKey];
  const task = {
    taskId,
    tabId: request.tabId,
    sourceId,
    // Filename sanitizing is applied later, only at the download boundary.
    title,
    resolution: data.resolution,
    width: Number(data.width) || Number.parseInt(data.resolution.split('x')[0], 10) || null,
    height: Number(data.height) || Number.parseInt(data.resolution.split('x')[1], 10) || null,
    bandwidth,
    duration,
    estimatedBytes,
    sourceType: detectedVideo?.sourceType || data.sourceType || 'hls',
    licenseUrl: isWidevineLicenseUrl(licenseUrl) ? licenseUrl : null,
    representationId: detectedStream?.representationId || data.representationId || null,
    audioRepresentationId: detectedStream?.audioRepresentationId || data.audioRepresentationId || null,
    masterUrl: data.masterUrl,
    streamUrl: data.streamUrl,
    audioUrl: data.audioUrl || null,
    hasExternalAudio: Boolean(data.hasExternalAudio),
    sessionKeys: Array.isArray(data.sessionKeys) ? data.sessionKeys : [],
    requestedFormat: 'mp4',
    actualFormat: null,
    phase: TaskPhase.QUEUED,
    downloadedBytes: 0,
    totalBytes: estimatedBytes,
    speed: 0,
    progress: 0,
    fallbackReason: null,
    error: null,
    message: '等待后台下载',
    filename: null,
    browserDownloadId: null,
    objectUrl: null,
    tempName: null,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null,
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
        message: '正在准备后台下载…',
        startedAt: task.startedAt || Date.now(),
        error: null,
      });
      await updateBadge('↓', '#007bff', task.tabId);

      try {
        const response = await sendToOffscreen({ type: MessageType.OFFSCREEN_START, task });
        if (!response?.accepted) throw new Error(response?.error || 'Offscreen 下载器未接受任务');
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
    message: fileReady.actualFormat === 'ts'
      ? 'MP4 封装失败，正在保存原始 TS…'
      : '正在保存 MP4…',
    objectUrl: fileReady.objectUrl,
    tempName: fileReady.tempName,
    fallbackReason: fileReady.fallbackReason || task.fallbackReason,
  });

  pendingFilenamesByUrl.set(fileReady.objectUrl, filename);
  try {
    const downloadId = await chrome.downloads.download({
      url: fileReady.objectUrl,
      filename,
      saveAs: true,
      conflictAction: 'uniquify',
    });
    const current = tasks.get(taskId);
    if (!current || current.phase !== TaskPhase.SAVING) {
      await chrome.downloads.cancel(downloadId).catch(() => {});
      return;
    }
    pendingDownloads.set(downloadId, taskId);
    await updateTask(taskId, { browserDownloadId: downloadId });
  } catch (error) {
    pendingFilenamesByUrl.delete(fileReady.objectUrl);
    await failTask(taskId, error?.message || '用户取消保存');
  }
}

async function releaseTaskFile(task) {
  if (!task?.objectUrl && !task?.tempName) return;
  await sendToOffscreen({
    type: MessageType.OFFSCREEN_RELEASE_FILE,
    taskId: task.taskId,
    objectUrl: task.objectUrl,
    tempName: task.tempName,
  }).catch(() => {});
}

async function finishTask(taskId) {
  const task = tasks.get(taskId);
  if (!task || task.phase === TaskPhase.COMPLETED) return;
  if (task.browserDownloadId) pendingDownloads.delete(task.browserDownloadId);
  await releaseTaskFile(task);

  const completedAt = Date.now();
  const elapsedSeconds = Math.max(0.001, (completedAt - (task.startedAt || task.createdAt)) / 1000);
  await updateTask(taskId, {
    phase: TaskPhase.COMPLETED,
    progress: 100,
    speed: 0,
    message: task.actualFormat === 'ts' ? '原始 TS 下载完成' : 'MP4 下载完成',
    completedAt,
    totalTime: elapsedSeconds,
    avgSpeed: task.downloadedBytes / elapsedSeconds,
    licenseUrl: null,
    objectUrl: null,
    tempName: null,
  }, MessageType.TASK_COMPLETED);
  await updateBadge('✓', '#28a745', task.tabId);
  activeTaskId = null;
  setTimeout(() => updateBadge(String(videoInfo.get(task.tabId)?.length || ''), '#666666', task.tabId), 3_000);
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
    // If MediaBunny does not unwind after aborting, terminate the disposable
    // Offscreen context. Its partial OPFS file is removed on the next startup.
    await chrome.offscreen.closeDocument().catch(() => {});
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
    error: message || '下载失败',
    licenseUrl: null,
    message: message || '下载失败',
    speed: 0,
    completedAt: Date.now(),
    objectUrl: null,
    tempName: null,
  }, MessageType.TASK_ERROR);
  await updateBadge('✗', '#dc3545', task.tabId);
  if (releaseSlot) releaseTaskSlot(taskId);
  setTimeout(() => updateBadge(String(videoInfo.get(task.tabId)?.length || ''), '#666666', task.tabId), 3_000);
}

async function cancelTask(taskId) {
  await bootstrapPromise;
  const task = tasks.get(taskId);
  if (!task || TERMINAL_TASK_PHASES.has(task.phase)) return false;
  if (task.phase === TaskPhase.QUEUED) {
    const index = queue.indexOf(taskId);
    if (index >= 0) queue.splice(index, 1);
    await failTask(taskId, '下载任务已取消');
    return true;
  }
  if (task.phase === TaskPhase.SAVING) {
    if (task.browserDownloadId) await chrome.downloads.cancel(task.browserDownloadId).catch(() => {});
    await sendToOffscreen({ type: MessageType.OFFSCREEN_CANCEL, taskId }).catch(() => {});
    await failTask(taskId, '下载任务已取消');
    return true;
  }

  // Remove the task from the UI first, then let Offscreen unwind in the
  // background. The active slot is released by OFFSCREEN_CANCELED/ERROR.
  await failTask(taskId, '下载任务已取消', { releaseSlot: false });
  const response = await sendToOffscreen({
    type: MessageType.OFFSCREEN_CANCEL,
    taskId,
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
      if (videoInfo.has(tabId)) return { videos: getDetectedVideos(tabId) };
      const context = getDetectionContext(tabId);
      const key = `${VIDEO_STORAGE_PREFIX}${tabId}`;
      const stored = await chrome.storage.local.get(key);
      if (detectionContexts.get(tabId) !== context || videoInfo.has(tabId)) {
        return { videos: getDetectedVideos(tabId) };
      }
      const videos = coalesceCmafObservations(stored[key] || []);
      videoInfo.set(tabId, videos);
      return { videos };
    }
    case MessageType.GET_TASKS:
      return {
        tasks: [...tasks.values()]
          .sort((left, right) => right.createdAt - left.createdAt)
          .map(toPublicTask),
        activeTaskId,
      };
    case MessageType.GET_DOWNLOAD_STATE: {
      const state = [...tasks.values()]
        .filter((task) => task.tabId === request.tabId && !TERMINAL_TASK_PHASES.has(task.phase))
        .sort((left, right) => right.createdAt - left.createdAt)[0];
      return { state: toPublicTask(state) };
    }
    case MessageType.DOWNLOAD_VIDEO:
      return { success: true, task: await createDownloadTask(request) };
    case MessageType.CANCEL_TASK:
      return { success: await cancelTask(request.taskId) };
    case MessageType.OPEN_POPUP:
      if (chrome.action.openPopup) await chrome.action.openPopup().catch(() => {});
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
        message: allowed.message || task.message,
      }, MessageType.TASK_UPDATED, { persist: phaseChanged });
      return { accepted: true };
    }
    case MessageType.OFFSCREEN_FILE_READY:
      void beginBrowserDownload(request.taskId, request.file);
      return { accepted: true };
    case MessageType.OFFSCREEN_ERROR:
      await failTask(request.taskId, request.error || '后台下载失败');
      return { accepted: true };
    case MessageType.OFFSCREEN_CANCELED:
      await failTask(request.taskId, '下载任务已取消');
      return { accepted: true };
    default:
      return null;
  }
}

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (!BACKGROUND_MESSAGE_TYPES.has(request?.type)) return false;
  handleMessage(request)
    .then((response) => sendResponse(response))
    .catch((error) => sendResponse({ success: false, error: error?.message || String(error) }));
  return true;
});

chrome.downloads.onDeterminingFilename.addListener((downloadItem, suggest) => {
  const url = downloadItem.finalUrl || downloadItem.url;
  const filename = pendingFilenamesByUrl.get(url)
    || pendingFilenamesByUrl.get(downloadItem.url);
  if (!filename) {
    suggest();
    return;
  }
  pendingFilenamesByUrl.delete(url);
  pendingFilenamesByUrl.delete(downloadItem.url);
  suggest({ filename, conflictAction: 'uniquify' });
});

chrome.downloads.onChanged.addListener((delta) => {
  if (!delta.state) return;
  const taskId = pendingDownloads.get(delta.id)
    || [...tasks.values()].find((task) => task.browserDownloadId === delta.id)?.taskId;
  if (!taskId) return;
  if (delta.state.current === 'complete') void finishTask(taskId);
  if (delta.state.current === 'interrupted') void failTask(taskId, '浏览器保存已取消或中断');
});

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    const { url, tabId } = details;
    if (isWidevineLicenseUrl(url)) {
      if (tabId >= 0 && details.method === 'POST' && /^https:\/\/([\w-]+\.)*rplay\.live$/.test(details.initiator || '')) {
        // Session storage is not exposed to content scripts. Never broadcast this URL.
        const context = getDetectionContext(tabId);
        void writeDetectionStorage(tabId, () => {
          if (detectionContexts.get(tabId) !== context) return;
          return chrome.storage.session.set({ [`${LICENSE_STORAGE_PREFIX}${tabId}`]: url });
        })
          .catch(() => {});
      }
      return;
    }
    if (!shouldInspectMediaRequest(details)) return;
    if (isKnownVideoSource(getDetectedVideos(tabId), url) || !shouldProcessUrl(tabId, url)) return;
    const context = getDetectionContext(tabId);

    setTimeout(async () => {
      try {
        if (detectionContexts.get(tabId) !== context || isKnownVideoSource(getDetectedVideos(tabId), url)) return;
        const detected = await inspectVideoSource(url, {
          fetchFn: (input, init = {}) => fetch(input, { ...init, credentials: 'include' }),
          resolveTitle: () => getRPlaySourceType(url) === 'cmaf'
            ? resolveCmafPageTitle(tabId, context) : resolvePageTitle(tabId),
          now: Date.now,
        });
        if (!detected || detectionContexts.get(tabId) !== context) return;
        const previous = getDetectedVideos(tabId);
        const list = mergeVideoSources(previous, detected);
        if (list === previous) return;
        videoInfo.set(tabId, list);
        await writeDetectionStorage(tabId, () => {
          if (detectionContexts.get(tabId) !== context) return;
          return chrome.storage.local.set({ [`${VIDEO_STORAGE_PREFIX}${tabId}`]: list });
        });
        if (detectionContexts.get(tabId) !== context) return;
        if (list.length !== previous.length) await updateBadge(String(list.length), '#666666', tabId);
        if (detectionContexts.get(tabId) !== context) return;
        // Adding an exact segment URL only updates this page's observation
        // group. It is not a new media item, so leave popup/content UI alone.
        if (isCmafTrackOnlySource(detected) && previous.some(isCmafTrackOnlySource)) return;
        broadcast({ type: MessageType.VIDEO_DETECTED, tabId, data: detected });
      } catch (error) {
        console.error('[RPlay] 检测媒体失败:', error);
      }
    }, 500);
  },
  { urls: ['*://*.rplay-cdn.com/*', '*://*.rplay.live/*', 'https://widevine-dash.ezdrm.com/*'] },
);

function clearTabDetection(tabId, { removed = false } = {}) {
  cmafTitleRequests.delete(tabId);
  if (removed) {
    detectionContexts.delete(tabId);
    videoInfo.delete(tabId);
  } else {
    detectionContexts.set(tabId, Symbol());
    // Do not restore old persisted entries while their removal is pending.
    videoInfo.set(tabId, []);
  }
  for (const key of processedUrls.keys()) {
    if (key.startsWith(`${tabId}:`)) processedUrls.delete(key);
  }
  void writeDetectionStorage(tabId, () => Promise.all([
    chrome.storage.local.remove(`${VIDEO_STORAGE_PREFIX}${tabId}`),
    chrome.storage.session.remove(`${LICENSE_STORAGE_PREFIX}${tabId}`),
  ])).catch(() => {});
  if (!removed) broadcast({ type: MessageType.VIDEO_INFO_CLEARED, tabId });
}

chrome.tabs.onRemoved.addListener((tabId) => clearTabDetection(tabId, { removed: true }));

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (!changeInfo.url && changeInfo.status !== 'loading') return;
  clearTabDetection(tabId);
  // Navigation only resets sniffed media; an independent download keeps
  // running and retains its progress badge.
  if (tasks.get(activeTaskId)?.tabId !== tabId) void updateBadge('', '#666666', tabId);
});

setInterval(() => {
  const cutoff = Date.now() - 60_000;
  for (const [key, timestamp] of processedUrls) {
    if (timestamp < cutoff) processedUrls.delete(key);
  }
}, 60_000);

console.log('RPlay Video Downloader background v2 loaded');
