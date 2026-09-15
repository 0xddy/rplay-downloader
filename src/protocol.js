export const TaskPhase = Object.freeze({
  QUEUED: 'queued',
  PREPARING: 'preparing',
  REMUXING: 'remuxing',
  FALLBACK_TS: 'fallback_ts',
  SAVING: 'saving',
  COMPLETED: 'completed',
  ERROR: 'error',
});

export const ACTIVE_TASK_PHASES = new Set([
  TaskPhase.QUEUED,
  TaskPhase.PREPARING,
  TaskPhase.REMUXING,
  TaskPhase.FALLBACK_TS,
  TaskPhase.SAVING,
]);

export const TERMINAL_TASK_PHASES = new Set([
  TaskPhase.COMPLETED,
  TaskPhase.ERROR,
]);

const TASK_TRANSITIONS = new Map([
  [TaskPhase.QUEUED, new Set([TaskPhase.PREPARING, TaskPhase.ERROR])],
  [TaskPhase.PREPARING, new Set([
    TaskPhase.REMUXING,
    TaskPhase.FALLBACK_TS,
    TaskPhase.SAVING,
    TaskPhase.ERROR,
  ])],
  [TaskPhase.REMUXING, new Set([TaskPhase.FALLBACK_TS, TaskPhase.SAVING, TaskPhase.ERROR])],
  [TaskPhase.FALLBACK_TS, new Set([TaskPhase.SAVING, TaskPhase.ERROR])],
  [TaskPhase.SAVING, new Set([TaskPhase.COMPLETED, TaskPhase.ERROR])],
]);

export function canTransitionTask(from, to) {
  return from === to || TASK_TRANSITIONS.get(from)?.has(to) === true;
}

export const MessageType = Object.freeze({
  GET_VIDEO_INFO: 'GET_VIDEO_INFO',
  GET_TASKS: 'GET_TASKS',
  GET_DOWNLOAD_STATE: 'GET_DOWNLOAD_STATE',
  DOWNLOAD_VIDEO: 'DOWNLOAD_VIDEO',
  CANCEL_TASK: 'CANCEL_TASK',
  OPEN_POPUP: 'OPEN_POPUP',
  VIDEO_DETECTED: 'VIDEO_DETECTED',
  VIDEO_INFO_CLEARED: 'VIDEO_INFO_CLEARED',
  GET_PAGE_VIDEO_TITLE: 'GET_PAGE_VIDEO_TITLE',
  TASK_CREATED: 'TASK_CREATED',
  TASK_UPDATED: 'TASK_UPDATED',
  TASK_COMPLETED: 'TASK_COMPLETED',
  TASK_ERROR: 'TASK_ERROR',
  OFFSCREEN_START: 'OFFSCREEN_START',
  OFFSCREEN_CANCEL: 'OFFSCREEN_CANCEL',
  OFFSCREEN_STATUS: 'OFFSCREEN_STATUS',
  OFFSCREEN_RELEASE_FILE: 'OFFSCREEN_RELEASE_FILE',
  OFFSCREEN_PROGRESS: 'OFFSCREEN_PROGRESS',
  OFFSCREEN_FILE_READY: 'OFFSCREEN_FILE_READY',
  OFFSCREEN_ERROR: 'OFFSCREEN_ERROR',
  OFFSCREEN_CANCELED: 'OFFSCREEN_CANCELED',
});

export const BACKGROUND_MESSAGE_TYPES = new Set([
  MessageType.GET_VIDEO_INFO,
  MessageType.GET_TASKS,
  MessageType.GET_DOWNLOAD_STATE,
  MessageType.DOWNLOAD_VIDEO,
  MessageType.CANCEL_TASK,
  MessageType.OPEN_POPUP,
  MessageType.OFFSCREEN_PROGRESS,
  MessageType.OFFSCREEN_FILE_READY,
  MessageType.OFFSCREEN_ERROR,
  MessageType.OFFSCREEN_CANCELED,
]);

export const OFFSCREEN_MESSAGE_TYPES = new Set([
  MessageType.OFFSCREEN_START,
  MessageType.OFFSCREEN_CANCEL,
  MessageType.OFFSCREEN_STATUS,
  MessageType.OFFSCREEN_RELEASE_FILE,
]);

export const TASK_EVENT_MESSAGE_TYPES = new Set([
  MessageType.TASK_CREATED,
  MessageType.TASK_UPDATED,
  MessageType.TASK_COMPLETED,
  MessageType.TASK_ERROR,
]);
