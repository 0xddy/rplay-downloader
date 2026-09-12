import { describe, expect, it, vi } from 'vitest';
import { TERMINAL_TASK_PHASES, TaskPhase } from '../src/protocol.js';
import { TaskStore, toPublicTask } from '../src/task-store.js';

function createStorage() {
  const data = {};
  return {
    data,
    get: vi.fn(async (key) => ({ [key]: data[key] })),
    set: vi.fn(async (updates) => Object.assign(data, updates)),
  };
}

function createTask(overrides = {}) {
  return {
    taskId: 'task-1',
    tabId: 1,
    phase: TaskPhase.QUEUED,
    createdAt: 1,
    updatedAt: 1,
    masterUrl: 'https://example.test/master.m3u8?token=secret',
    streamUrl: 'https://example.test/video.m3u8?token=secret',
    sessionKeys: [{ uri: 'https://example.test/key' }],
    licenseUrl: 'https://example.test/license?token=private',
    cdmSettings: { port: 18889, token: 'private pairing code' },
    ...overrides,
  };
}

describe('task store', () => {
  it('owns persistence, events and transition validation', async () => {
    const storageArea = createStorage();
    const onEvent = vi.fn();
    const store = new TaskStore({
      storageArea,
      storageKey: 'tasks',
      terminalPhases: TERMINAL_TASK_PHASES,
      onEvent,
      now: () => 10,
    });
    await store.add(createTask(), 'TASK_CREATED');
    await store.update('task-1', { phase: TaskPhase.PREPARING }, { eventType: 'TASK_UPDATED' });

    expect(store.get('task-1').updatedAt).toBe(10);
    expect(storageArea.set).toHaveBeenCalledTimes(2);
    expect(onEvent).toHaveBeenCalledTimes(2);
    await expect(store.update('task-1', { phase: TaskPhase.COMPLETED })).rejects.toThrow('非法任务状态流转');
  });

  it('keeps private media URLs and key data out of public tasks', () => {
    const visible = toPublicTask(createTask({ sourceId: 'safe-id' }));

    expect(visible.sourceId).toBe('safe-id');
    expect(visible.masterUrl).toBeUndefined();
    expect(visible.streamUrl).toBeUndefined();
    expect(visible.sessionKeys).toBeUndefined();
    expect(visible.licenseUrl).toBeUndefined();
    expect(visible.cdmSettings).toBeUndefined();
  });
});
