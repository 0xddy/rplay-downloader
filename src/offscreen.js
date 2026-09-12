import {
  TaskCanceledError,
  isAbortError,
  shouldFallbackToTs,
} from './errors.js';
import { abortDownloadContext } from './download-session.js';
import { remuxToMp4 } from './mp4-remux.js';
import { makeDownloadFilename } from './naming.js';
import { cleanupStaleFiles, removeTempFile } from './opfs.js';
import {
  MessageType,
  OFFSCREEN_MESSAGE_TYPES,
  TaskPhase,
} from './protocol.js';
import { ProgressReporter } from './progress.js';
import { downloadFallbackTs } from './ts-fallback.js';
import { createCdmKeyResolver } from './cdm-client.js';

let activeContext = null;
const readyFiles = new Map();
const cleanupPromise = cleanupStaleFiles();

async function exposeReadyFile(task, temp, actualFormat, fallbackReason, context) {
  const file = await temp.handle.getFile();
  const mimeType = actualFormat === 'mp4' ? 'video/mp4' : 'video/mp2t';
  const filename = makeDownloadFilename(task, actualFormat);
  const namedFile = new File([file], filename, {
    type: mimeType,
    lastModified: Date.now(),
  });
  const objectUrl = URL.createObjectURL(namedFile);
  const ready = {
    objectUrl,
    tempName: temp.tempName,
    filename,
    actualFormat,
    size: file.size,
    fallbackReason,
  };
  readyFiles.set(task.taskId, ready);
  context.fileReady = ready;
  await chrome.runtime.sendMessage({
    type: MessageType.OFFSCREEN_FILE_READY,
    taskId: task.taskId,
    file: ready,
  });
}

async function executeTask(task) {
  await cleanupPromise;
  const context = {
    taskId: task.taskId,
    controller: new AbortController(),
    input: null,
    audioInput: null,
    output: null,
    prefetcher: null,
    fileReady: null,
  };
  context.done = new Promise((resolve) => {
    context.resolveDone = resolve;
  });
  context.resolveMediaKey = createCdmKeyResolver(task, context);
  activeContext = context;
  const reporter = new ProgressReporter(task);
  reporter.setPhase(TaskPhase.PREPARING, task.sourceType === 'dash' ? '正在分析 DASH 音视频轨道…' : '正在分析 HLS 轨道…');

  try {
    let temp;
    let actualFormat = 'mp4';
    let fallbackReason = null;
    try {
      temp = await remuxToMp4(task, reporter, context);
    } catch (error) {
      if (isAbortError(error) || context.controller.signal.aborted) throw new TaskCanceledError();
      if (task.sourceType === 'dash' || !shouldFallbackToTs(error)) throw error;
      fallbackReason = error?.message || 'MP4 换封装不兼容';
      actualFormat = 'ts';
      try {
        temp = await downloadFallbackTs(task, reporter, context, fallbackReason);
      } catch (fallbackError) {
        throw new Error(`${fallbackReason}；TS 回退失败：${fallbackError?.message || fallbackError}`);
      }
    }

    reporter.setPhase(
      TaskPhase.SAVING,
      actualFormat === 'mp4' ? 'MP4 已生成，等待保存…' : 'TS 回退已完成，等待保存…',
      { actualFormat, fallbackReason },
    );
    await exposeReadyFile(task, temp, actualFormat, fallbackReason, context);
  } catch (error) {
    if (activeContext === context) activeContext = null;
    if (isAbortError(error) || context.controller.signal.aborted) {
      await chrome.runtime.sendMessage({
        type: MessageType.OFFSCREEN_CANCELED,
        taskId: task.taskId,
      }).catch(() => {});
    } else {
      await chrome.runtime.sendMessage({
        type: MessageType.OFFSCREEN_ERROR,
        taskId: task.taskId,
        error: error?.message || String(error),
      }).catch(() => {});
    }
  } finally {
    context.resolveMediaKey.dispose();
    context.resolveDone();
  }
}

function cancelActiveTask(taskId) {
  if (!activeContext || activeContext.taskId !== taskId) return false;
  return abortDownloadContext(activeContext);
}

async function releaseFile(request) {
  const ready = readyFiles.get(request.taskId);
  const objectUrl = ready?.objectUrl || request.objectUrl;
  const tempName = ready?.tempName || request.tempName;
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  if (tempName) await removeTempFile({ tempName });
  readyFiles.delete(request.taskId);
  if (activeContext?.taskId === request.taskId) activeContext = null;
  return true;
}

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (!OFFSCREEN_MESSAGE_TYPES.has(request?.type)) return false;

  if (request.type === MessageType.OFFSCREEN_START) {
    if (activeContext) {
      sendResponse({ accepted: false, error: '已有后台任务正在执行' });
      return false;
    }
    void executeTask(request.task);
    sendResponse({ accepted: true });
    return false;
  }
  if (request.type === MessageType.OFFSCREEN_STATUS) {
    sendResponse({
      activeTaskId: activeContext?.taskId || null,
      fileReady: activeContext?.fileReady || null,
    });
    return false;
  }

  const action = request.type === MessageType.OFFSCREEN_CANCEL
    ? Promise.resolve(cancelActiveTask(request.taskId))
    : releaseFile(request);
  action
    .then((success) => sendResponse({ success }))
    .catch((error) => sendResponse({ success: false, error: error?.message || String(error) }));
  return true;
});

console.log('RPlay Video Downloader offscreen v2 loaded');
