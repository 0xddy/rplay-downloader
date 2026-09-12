import { canTransitionTask } from './protocol.js';

const PRIVATE_TASK_FIELDS = new Set([
  'masterUrl',
  'streamUrl',
  'audioUrl',
  'objectUrl',
  'tempName',
  'sessionKeys',
  'licenseUrl',
  'cdmSettings',
]);

export function toPublicTask(task) {
  if (!task) return null;
  return Object.fromEntries(
    Object.entries(task).filter(([key]) => !PRIVATE_TASK_FIELDS.has(key)),
  );
}

export class TaskStore {
  constructor({ storageArea, storageKey, terminalPhases, onEvent = () => {}, now = Date.now }) {
    this.storageArea = storageArea;
    this.storageKey = storageKey;
    this.terminalPhases = terminalPhases;
    this.onEvent = onEvent;
    this.now = now;
    this.tasks = new Map();
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
    validateTransition = true,
  } = {}) {
    const task = this.get(taskId);
    if (!task) return null;
    if (
      validateTransition
      && updates.phase
      && !canTransitionTask(task.phase, updates.phase)
    ) {
      throw new Error(`非法任务状态流转：${task.phase} → ${updates.phase}`);
    }

    Object.assign(task, updates, { updatedAt: this.now() });
    if (persist) await this.persist();
    if (eventType) this.onEvent(eventType, task);
    return task;
  }

  async persist() {
    const ordered = [...this.tasks.values()]
      .sort((left, right) => right.createdAt - left.createdAt);
    const active = ordered.filter((task) => !this.terminalPhases.has(task.phase));
    const terminalLimit = Math.min(20, Math.max(0, 50 - active.length));
    const terminal = ordered.filter((task) => this.terminalPhases.has(task.phase)).slice(0, terminalLimit);
    // Never prune a queued/running task just because newer history exists.
    const retained = [...active, ...terminal]
      .sort((left, right) => right.createdAt - left.createdAt);
    const retainedIds = new Set(retained.map((task) => task.taskId));
    for (const taskId of this.tasks.keys()) {
      if (!retainedIds.has(taskId)) this.tasks.delete(taskId);
    }
    await this.storageArea.set({ [this.storageKey]: retained });
  }
}
