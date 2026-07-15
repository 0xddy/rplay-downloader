import { createSourceId, estimateMediaBytes } from './src/media.js';
import { normalizeVideoTitle } from './src/naming.js';
import {
  ACTIVE_TASK_PHASES,
  MessageType,
  TASK_EVENT_MESSAGE_TYPES,
  TaskPhase,
} from './src/protocol.js';

let currentTabId = null;
let currentTasks = [];
let videos = [];
let currentPageTitle = '';

function message(key, substitutions, fallback = '') {
  return chrome.i18n.getMessage(key, substitutions) || fallback;
}

function initI18n() {
  document.getElementById('headerTitle').textContent = `📥 ${message('headerTitle', null, 'RPlay Video Downloader')}`;
  document.getElementById('headerSubtitle').textContent = message('headerSubtitle', null, '一键下载 rplay.live 视频');
  document.getElementById('noVideoTitle').textContent = message('noVideoDetected', null, '未检测到视频');
  document.getElementById('noVideoDesc').textContent = message('noVideoDescription', null, '请打开 RPlay 视频播放页面');
  document.getElementById('footerText').textContent = message('footerText', null, '喜欢本插件请给个 Star');
  document.getElementById('githubText').textContent = message('github', null, 'GitHub');
}

document.addEventListener('DOMContentLoaded', async () => {
  initI18n();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTabId = tab?.id ?? null;
  await Promise.all([loadVideos(), loadTasks(), loadPageTitle()]);
  render();

  chrome.runtime.onMessage.addListener((request) => {
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
    if (request.type === MessageType.TASK_ERROR && request.task.error !== '下载任务已取消') {
      showStatusMessage(request.task.error || '下载失败', 'error');
    }
  });
});

async function loadVideos() {
  if (!currentTabId) return;
  const response = await chrome.runtime.sendMessage({
    type: MessageType.GET_VIDEO_INFO,
    tabId: currentTabId,
  }).catch(() => null);
  videos = response?.videos || [];
}

async function loadTasks() {
  const response = await chrome.runtime.sendMessage({ type: MessageType.GET_TASKS }).catch(() => null);
  currentTasks = response?.tasks || [];
}

async function loadPageTitle() {
  if (!currentTabId) return;
  const pageInfo = await chrome.tabs.sendMessage(currentTabId, {
    type: MessageType.GET_PAGE_VIDEO_TITLE,
  }).catch(() => null);
  currentPageTitle = normalizeVideoTitle(pageInfo?.title);
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
  return getActiveTasks().find((task) => (
    task.tabId === currentTabId && task.sourceId === sourceId
  ));
}

function render() {
  const list = document.getElementById('videoList');
  const renderedTaskIds = new Set();
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
  const list = document.getElementById('videoList');
  const empty = list.children.length === 0;
  document.getElementById('emptyState').style.display = empty ? 'block' : 'none';
  list.style.display = empty ? 'none' : 'block';
}

function progressValue(task) {
  return Math.max(0, Math.min(100, Math.round(task.progress || 0)));
}

function createTaskProgress(task) {
  const progress = document.createElement('div');
  progress.className = 'inline-task-progress';
  progress.dataset.taskId = task.taskId;

  const track = document.createElement('div');
  track.className = 'inline-progress-track';
  const bar = document.createElement('div');
  bar.className = 'inline-progress-bar';
  bar.dataset.taskBar = '';
  bar.style.width = `${progressValue(task)}%`;
  track.appendChild(bar);

  const footer = document.createElement('div');
  footer.className = 'inline-progress-footer';
  const speed = document.createElement('span');
  speed.className = 'inline-progress-speed';
  speed.dataset.taskSpeed = '';
  speed.textContent = formatSpeed(task.speed || 0);

  const actions = document.createElement('div');
  actions.className = 'inline-progress-actions';
  const value = document.createElement('strong');
  value.className = 'inline-progress-value';
  value.dataset.taskProgress = '';
  value.textContent = `${progressValue(task)}%`;
  const cancel = document.createElement('button');
  cancel.className = 'inline-cancel-btn';
  cancel.textContent = message('cancelButton', null, '取消');
  cancel.addEventListener('click', () => cancelTask(task.taskId, cancel));
  actions.append(value, cancel);
  footer.append(speed, actions);
  progress.append(track, footer);
  return progress;
}

function patchTaskProgress(task) {
  const progress = document.querySelector(`[data-task-id="${CSS.escape(task.taskId)}"]`);
  if (!progress) return false;
  const value = progressValue(task);
  progress.querySelector('[data-task-bar]').style.width = `${value}%`;
  progress.querySelector('[data-task-progress]').textContent = `${value}%`;
  progress.querySelector('[data-task-speed]').textContent = formatSpeed(task.speed || 0);
  return true;
}

function attachTaskProgress(task) {
  if (!ACTIVE_TASK_PHASES.has(task.phase)) return;
  if (document.querySelector(`[data-task-id="${CSS.escape(task.taskId)}"]`)) return;

  const shell = task.tabId === currentTabId
    ? document.querySelector(`[data-stream-source-id="${CSS.escape(task.sourceId || '')}"]`)
    : null;
  if (shell) {
    shell.classList.add('has-task');
    shell.appendChild(createTaskProgress(task));
  } else {
    document.getElementById('videoList').appendChild(createDetachedTaskItem(task));
  }
}

function removeTaskProgress(taskId) {
  const progress = document.querySelector(`[data-task-id="${CSS.escape(taskId)}"]`);
  if (!progress) return;
  const detached = progress.closest('.detached-task-item');
  if (detached) {
    detached.remove();
    return;
  }
  const shell = progress.closest('.stream-shell');
  progress.remove();
  shell?.classList.remove('has-task');
}

async function cancelTask(taskId, button) {
  button.disabled = true;
  const response = await chrome.runtime.sendMessage({
    type: MessageType.CANCEL_TASK,
    taskId,
  }).catch((error) => ({ success: false, error: error?.message || String(error) }));
  if (!response?.success) {
    button.disabled = false;
    showStatusMessage(response?.error || '取消任务失败', 'error');
  }
}

function syncVideoButtons() {
  document.querySelectorAll('[data-source-id]').forEach((button) => {
    button.disabled = Boolean(getSourceTask(button.dataset.sourceId));
    button.textContent = message('downloadButton', null, '下载');
  });
}

function createVideoItem(video, videoIndex, renderedTaskIds) {
  const item = document.createElement('div');
  item.className = 'video-item video-card';
  const header = document.createElement('div');
  header.className = 'video-header';
  const title = document.createElement('div');
  title.className = 'video-title';
  title.textContent = currentPageTitle
    || normalizeVideoTitle(video.title)
    || message('videoNumber', [(videoIndex + 1).toString()], `视频 #${videoIndex + 1}`);
  title.title = title.textContent;
  const time = document.createElement('div');
  time.className = 'video-time';
  time.textContent = video.duration ? formatDuration(video.duration) : new Date(video.timestamp).toLocaleTimeString();
  header.append(title, time);
  item.appendChild(header);

  video.streams.forEach((stream) => {
    const sourceId = createSourceId(video.baseUrl, stream.url);
    const shell = document.createElement('div');
    shell.className = 'stream-shell';
    shell.dataset.streamSourceId = sourceId;
    const row = document.createElement('div');
    row.className = 'stream-option';
    const info = document.createElement('div');
    info.className = 'stream-info';
    const resolution = document.createElement('div');
    resolution.className = 'resolution';
    resolution.append(document.createTextNode(stream.resolution || `${stream.width}x${stream.height}`));
    const qualityBadge = document.createElement('span');
    qualityBadge.className = `quality-badge ${stream.height >= 1080 ? 'quality-fhd' : stream.height >= 720 ? 'quality-hd' : 'quality-sd'}`;
    qualityBadge.textContent = stream.height >= 1080
      ? message('qualityHigh', null, '高清')
      : stream.height >= 720
        ? message('qualityStandard', null, '标清')
        : message('qualityLow', null, '低清');
    resolution.appendChild(qualityBadge);
    const bandwidth = document.createElement('div');
    bandwidth.className = 'bandwidth';
    const bitrate = stream.bandwidth
      ? `${(stream.bandwidth / 1_000_000).toFixed(2)} Mbps`
      : message('unknown', null, '未知');
    const estimatedBytes = estimateMediaBytes(stream.bandwidth, video.duration);
    bandwidth.textContent = `${message('bitrate', null, '码率')}: ${bitrate}${
      estimatedBytes ? ` · ~${formatSize(estimatedBytes)}` : ''
    }`;
    info.append(resolution, bandwidth);

    const button = document.createElement('button');
    button.className = 'download-btn';
    button.dataset.sourceId = sourceId;
    button.textContent = message('downloadButton', null, '下载');
    button.disabled = Boolean(getSourceTask(sourceId));
    button.addEventListener('click', () => startDownload(video, stream, sourceId, button));
    row.append(info, button);
    shell.appendChild(row);

    const task = getSourceTask(sourceId);
    if (task) {
      shell.classList.add('has-task');
      shell.appendChild(createTaskProgress(task));
      renderedTaskIds.add(task.taskId);
    }
    item.appendChild(shell);
  });
  return item;
}

function createDetachedTaskItem(task) {
  const item = document.createElement('div');
  item.className = 'video-item video-card detached-task-item';
  const header = document.createElement('div');
  header.className = 'video-header compact-header';
  const title = document.createElement('div');
  title.className = 'video-title';
  title.textContent = task.title || task.resolution;
  title.title = title.textContent;
  const resolution = document.createElement('div');
  resolution.className = 'video-time';
  resolution.textContent = task.resolution;
  header.append(title, resolution);
  item.append(header, createTaskProgress(task));
  return item;
}

async function startDownload(video, stream, sourceId, button) {
  button.disabled = true;
  const pageInfo = await chrome.tabs.sendMessage(currentTabId, {
    type: MessageType.GET_PAGE_VIDEO_TITLE,
  }).catch(() => null);
  const liveTitle = normalizeVideoTitle(pageInfo?.title);
  if (liveTitle) currentPageTitle = liveTitle;
  const response = await chrome.runtime.sendMessage({
    type: MessageType.DOWNLOAD_VIDEO,
    tabId: currentTabId,
    sourceId,
    data: {
      masterUrl: video.baseUrl,
      streamUrl: stream.url,
      audioUrl: stream.audioUrl || null,
      title: liveTitle || currentPageTitle || normalizeVideoTitle(video.title),
      resolution: stream.resolution,
      width: stream.width,
      height: stream.height,
      bandwidth: stream.bandwidth,
      duration: video.duration,
      hasExternalAudio: stream.hasExternalAudio,
      sessionKeys: video.sessionKeys || [],
    },
  }).catch((error) => ({ success: false, error: error?.message || String(error) }));
  if (!response?.success) {
    button.disabled = false;
    showStatusMessage(response?.error || '无法创建下载任务', 'error');
    return;
  }
  upsertTask(response.task);
  attachTaskProgress(response.task);
  syncVideoButtons();
  syncEmptyState();
}

function showCompletion(task) {
  const suffix = task.actualFormat === 'ts'
    ? `（MP4 不兼容，已保存原始 TS：${task.fallbackReason || '未知原因'}）`
    : '';
  showStatusMessage(
    `${message('downloadComplete', [task.filename || ''], '下载完成')} ${suffix}`,
    task.actualFormat === 'ts' ? 'warning' : 'success',
  );
}

function showStatusMessage(text, type) {
  const element = document.getElementById('statusMessage');
  element.textContent = text;
  element.className = `status-message ${type}`;
  setTimeout(() => {
    if (element.textContent === text) element.className = 'status-message';
  }, 8_000);
}

function formatSpeed(bytesPerSecond) {
  if (!bytesPerSecond) return '0 B/s';
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
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = total % 60;
  return [hours, minutes, remainder].map((value) => String(value).padStart(2, '0')).join(':');
}
