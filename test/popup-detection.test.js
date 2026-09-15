import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function event() {
  const listeners = [];
  return {
    addListener: vi.fn((listener) => listeners.push(listener)),
    emit: (...args) => listeners.forEach((listener) => listener(...args)),
  };
}

function element() {
  return {
    children: [],
    style: {},
    dataset: {},
    append(...children) { this.children.push(...children); },
    appendChild(child) { this.children.push(child); return child; },
    replaceChildren(...children) { this.children = children; },
    setAttribute: vi.fn(),
    addEventListener: vi.fn(),
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

const source = (title = 'Previous video') => ({
  title, sourceType: 'cmaf', baseUrl: 'https://pb3.rplay.live/example/video.cmfv',
  timestamp: 1, streams: [], unavailableReason: 'cmafNeedsPlaylist',
});

describe('popup detection lifecycle', () => {
  let chrome;
  let elements;
  let initialize;
  let storedVideos;
  let storedTasks;

  beforeEach(async () => {
    vi.resetModules();
    elements = new Map();
    storedVideos = [source()];
    storedTasks = [];
    const document = {
      addEventListener: vi.fn((type, listener) => {
        if (type === 'DOMContentLoaded') initialize = listener;
      }),
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, element());
        return elements.get(id);
      },
      createElement: element,
      querySelectorAll: () => [],
      querySelector: () => null,
    };
    chrome = {
      i18n: { getMessage: vi.fn(() => '') },
      tabs: {
        query: vi.fn(async () => [{ id: 7 }]),
        sendMessage: vi.fn(async () => ({ title: '' })),
      },
      runtime: {
        onMessage: event(),
        sendMessage: vi.fn(async ({ type }) => type === 'GET_VIDEO_INFO'
          ? { videos: storedVideos } : { tasks: storedTasks }),
      },
    };
    vi.stubGlobal('document', document);
    vi.stubGlobal('chrome', chrome);
    vi.stubGlobal('CSS', { escape: (value) => value });
    await import('../popup.js');
  });

  afterEach(() => vi.unstubAllGlobals());

  const clear = () => chrome.runtime.onMessage.emit({ type: 'VIDEO_INFO_CLEARED', tabId: 7 });
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const list = () => elements.get('videoList');

  it('immediately clears an open popup when the current tab reloads', async () => {
    await initialize();
    expect(list().children).toHaveLength(1);
    clear();
    expect(list().children).toEqual([]);
    expect(elements.get('emptyState').style.display).toBe('block');
  });

  it('keeps active download tasks visible after clearing sniffed sources', async () => {
    storedTasks = [{ taskId: 'active', tabId: 7, sourceId: 'active-source',
      title: 'Downloading video', resolution: '1920x1080', phase: 'remuxing', progress: 40 }];
    await initialize();
    expect(list().children).toHaveLength(2);
    clear();
    expect(list().children).toHaveLength(1);
    expect(list().children[0].className).toContain('detached-task-item');
    expect(elements.get('emptyState').style.display).toBe('none');
  });

  it('keeps task events received before the initial task snapshot completes', async () => {
    storedVideos = [];
    const taskRead = deferred();
    chrome.runtime.sendMessage.mockImplementation(({ type }) => type === 'GET_TASKS'
      ? taskRead.promise : Promise.resolve({ videos: [] }));
    const initializing = initialize();
    await settle();
    const task = { taskId: 'new-task', tabId: 7, sourceId: 'new-source', title: 'New download',
      resolution: '1920x1080', phase: 'remuxing', progress: 30 };
    chrome.runtime.onMessage.emit({ type: 'TASK_CREATED', task });
    clear();
    taskRead.resolve({ tasks: [] });
    await initializing;
    expect(list().children).toHaveLength(1);
    expect(list().children[0].className).toContain('detached-task-item');
    expect(list().children[0].children[0].children[0].textContent).toBe('New download');
  });

  it('keeps newer task progress instead of restoring an older startup snapshot', async () => {
    storedVideos = [];
    const taskRead = deferred();
    chrome.runtime.sendMessage.mockImplementation(({ type }) => type === 'GET_TASKS'
      ? taskRead.promise : Promise.resolve({ videos: [] }));
    const initializing = initialize();
    await settle();
    const task = { taskId: 'active', tabId: 7, sourceId: 'active-source', title: 'Downloading video',
      resolution: '1920x1080', phase: 'remuxing', progress: 70 };
    chrome.runtime.onMessage.emit({ type: 'TASK_UPDATED', task });
    taskRead.resolve({ tasks: [{ ...task, progress: 10 }] });
    await initializing;
    expect(list().children).toHaveLength(1);
    expect(list().children[0].children[1].children[0].children[0].style.width).toBe('70%');
  });

  it('ignores clear events from another tab', async () => {
    await initialize();
    chrome.runtime.onMessage.emit({ type: 'VIDEO_INFO_CLEARED', tabId: 8 });
    expect(list().children).toHaveLength(1);
  });

  it('does not restore a stale source read after a clear event', async () => {
    await initialize();
    const pending = deferred();
    chrome.runtime.sendMessage.mockImplementationOnce(() => pending.promise);
    chrome.runtime.onMessage.emit({ type: 'VIDEO_DETECTED', tabId: 7 });
    clear();
    pending.resolve({ videos: [source()] });
    await settle();
    expect(list().children).toEqual([]);
  });

  it('handles clear events while the initial source read is still pending', async () => {
    const pending = deferred();
    chrome.runtime.sendMessage.mockImplementation(({ type }) => type === 'GET_VIDEO_INFO'
      ? pending.promise : Promise.resolve({ tasks: [] }));
    const initializing = initialize();
    await settle();
    clear();
    pending.resolve({ videos: [source()] });
    await initializing;
    expect(list().children).toEqual([]);
  });

  it('keeps the latest source response when detection messages overlap', async () => {
    await initialize();
    const oldRead = deferred();
    chrome.runtime.sendMessage.mockImplementationOnce(() => oldRead.promise);
    chrome.runtime.onMessage.emit({ type: 'VIDEO_DETECTED', tabId: 7 });
    storedVideos = [source('Latest video')];
    chrome.runtime.onMessage.emit({ type: 'VIDEO_DETECTED', tabId: 7 });
    await settle();
    oldRead.resolve({ videos: [source()] });
    await settle();
    expect(list().children).toHaveLength(1);
    expect(list().children[0].children[0].children[0].textContent).toBe('Latest video');
  });

  it('redisplays newly detected sources without restoring the previous page title', async () => {
    chrome.tabs.sendMessage.mockResolvedValueOnce({ title: 'Previous page | RPLAY' });
    await initialize();
    const oldTitle = deferred();
    chrome.tabs.sendMessage.mockImplementationOnce(() => oldTitle.promise);
    chrome.runtime.onMessage.emit({ type: 'VIDEO_DETECTED', tabId: 7 });
    clear();
    storedVideos = [source('New video')];
    chrome.tabs.sendMessage.mockResolvedValue({ title: 'New page | RPLAY' });
    chrome.runtime.onMessage.emit({ type: 'VIDEO_DETECTED', tabId: 7 });
    await settle();
    oldTitle.resolve({ title: 'Previous page | RPLAY' });
    await settle();
    expect(list().children).toHaveLength(1);
    expect(list().children[0].children[0].children[0].textContent).toBe('New page');
  });

  it('loads sources for tab zero', async () => {
    chrome.tabs.query.mockResolvedValue([{ id: 0 }]);
    await initialize();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'GET_VIDEO_INFO', tabId: 0 });
    expect(list().children).toHaveLength(1);
  });
});
