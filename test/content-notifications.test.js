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
    listeners: new Map(),
    append(...children) {
      for (const child of children) {
        child.parent = this;
        this.children.push(child);
      }
    },
    appendChild(child) { this.append(child); return child; },
    remove() {
      if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this);
    },
    setAttribute: vi.fn(),
    addEventListener(type, listener) { this.listeners.set(type, listener); },
  };
}

const source = (overrides = {}) => ({
  sourceType: 'hls', baseUrl: 'https://pb3.rplay.live/video/master.m3u8',
  streams: [{ url: 'https://pb3.rplay.live/video/1080.m3u8', unavailableReason: null }],
  ...overrides,
});

describe('content detection notifications', () => {
  let chrome;
  let document;
  let location;
  let notifications;

  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    notifications = [];
    const head = element();
    const body = element();
    const append = body.appendChild.bind(body);
    body.appendChild = (child) => {
      if (child.id === 'rplay-video-notification') notifications.push(child);
      return append(child);
    };
    const find = (node, id) => node.id === id ? node : node.children.map((child) => find(child, id)).find(Boolean);
    document = {
      head, body, documentElement: element(), title: 'Example | RPLAY',
      getElementById: (id) => find(head, id) || find(body, id),
      createElement: element,
      querySelector: () => null,
    };
    location = { href: 'https://rplay.live/play/first-video' };
    chrome = {
      runtime: { onMessage: event(), sendMessage: vi.fn(async () => {}) },
      i18n: { getMessage: vi.fn((key) => key) },
    };
    vi.stubGlobal('chrome', chrome);
    vi.stubGlobal('document', document);
    vi.stubGlobal('location', location);
    await import('../content.js');
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const detect = (data) => chrome.runtime.onMessage.emit({ type: 'VIDEO_DETECTED', data });
  const clear = () => chrome.runtime.onMessage.emit({ type: 'VIDEO_INFO_CLEARED', tabId: 7 });

  it('silences every CMAF track-only observation without creating notification styles', () => {
    for (let index = 0; index < 10; index += 1) {
      detect(source({ sourceType: 'cmaf', baseUrl: `https://pb3.rplay.live/video/${index}.cmfv`,
        streams: [], unavailableReason: 'cmafNeedsPlaylist' }));
    }
    expect(notifications).toHaveLength(0);
    expect(document.head.children).toEqual([]);
  });

  it('can notify the downloadable manifest after a silent CMAF observation', () => {
    detect(source({ sourceType: 'cmaf', streams: [], unavailableReason: 'cmafNeedsPlaylist' }));
    detect(source());
    expect(notifications).toHaveLength(1);
    expect(notifications[0].children[1].children[1].textContent).toBe('streamsFound');
  });

  it('does not restart or redisplay a notification for the same complete source URL', () => {
    detect(source());
    vi.advanceTimersByTime(4000);
    detect(source({ timestamp: 2, title: 'Updated title' }));
    expect(notifications).toHaveLength(1);
    vi.advanceTimersByTime(1000);
    expect(document.getElementById('rplay-video-notification')).toBeUndefined();
    detect(source());
    expect(notifications).toHaveLength(1);
  });

  it('deduplicates manifest aliases by playable video URLs and remembers new aliases', () => {
    detect(source());
    detect(source({ baseUrl: 'https://pb3.rplay.live/video/alias.m3u8', streams: [
      ...source().streams, { url: 'https://pb3.rplay.live/video/720.m3u8' },
    ] }));
    detect(source({ baseUrl: 'https://pb3.rplay.live/video/720.m3u8',
      streams: [{ url: 'https://pb3.rplay.live/video/720.m3u8' }] }));
    expect(notifications).toHaveLength(1);
  });

  it('does not combine different videos identified by query parameters', () => {
    for (const key of ['first-video', 'second-video']) {
      detect(source({ baseUrl: `https://api.rplay.live/content/hlsstream?s3key=${key}`,
        streams: [{ url: `https://pb3.rplay.live/play.m3u8?s3key=${key}` }] }));
    }
    expect(notifications).toHaveLength(2);
  });

  it('does not deduplicate different video sources that share related audio or initialization URLs', () => {
    const sharedUrl = 'https://pb3.rplay.live/shared/audio.cmfa';
    detect(source({ relatedUrls: [sharedUrl] }));
    detect(source({ baseUrl: 'https://pb3.rplay.live/other/master.m3u8', relatedUrls: [sharedUrl],
      streams: [{ url: 'https://pb3.rplay.live/other/video.m3u8', audioUrl: sharedUrl }] }));
    expect(notifications).toHaveLength(2);
  });

  it('allows the same source to announce again after client-side navigation', () => {
    detect(source());
    location.href = 'https://rplay.live/play/second-video';
    detect(source());
    expect(notifications).toHaveLength(2);
    expect(document.body.children).toHaveLength(1);
  });

  it('clears the old page notification even when only silent tracks arrive on the new page', () => {
    detect(source());
    location.href = 'https://rplay.live/play/second-video';
    detect(source({ sourceType: 'cmaf', streams: [], unavailableReason: 'cmafNeedsPlaylist' }));
    expect(document.body.children).toEqual([]);
    detect(source());
    expect(notifications).toHaveLength(2);
  });

  it('removes a cleared notification without enabling repeated alerts for the same page', () => {
    detect(source());
    clear();
    expect(document.body.children).toEqual([]);
    clear();
    detect(source());
    expect(notifications).toHaveLength(1);
    location.href = 'https://rplay.live/play/second-video';
    clear();
    detect(source());
    expect(notifications).toHaveLength(2);
  });

  it('keeps explicit unsupported layout and DRM reasons visible once per reason', () => {
    const unavailable = source({ sourceType: 'dash', streams: [{
      url: 'https://pb3.rplay.live/video/video.cmfv', unavailableReason: 'dashLayoutUnsupported',
    }] });
    detect(unavailable);
    detect(unavailable);
    expect(notifications).toHaveLength(1);
    expect(notifications[0].children[1].children[1].textContent).toBe('dashLayoutUnsupported');
    detect(source({ sourceType: 'dash', streams: [], unavailableReason: 'dashUnsupported' }));
    expect(notifications).toHaveLength(2);
    detect(source({ streams: [{ url: source().streams[0].url, unavailableReason: 'drmUnsupported' }] }));
    expect(notifications).toHaveLength(3);
    expect(notifications[2].children[1].children[1].textContent).toBe('drmUnsupported');
    detect(source());
    expect(notifications).toHaveLength(4);
  });

  it('silences malformed data and observations without stream options or an explicit error', () => {
    detect(undefined);
    detect({});
    detect(source({ streams: [] }));
    detect(source({ streams: [{ url: '' }] }));
    detect(source({ sourceType: 'cmaf', streams: [] }));
    expect(notifications).toHaveLength(0);
  });

  it('retains popup activation by click and keyboard for downloadable notifications', () => {
    detect(source());
    const notification = notifications[0];
    expect(notification.setAttribute).toHaveBeenCalledWith('role', 'button');
    expect(notification.setAttribute).toHaveBeenCalledWith('tabindex', '0');
    notification.listeners.get('click')();
    notification.listeners.get('keydown')({ key: 'Enter' });
    notification.listeners.get('keydown')({ key: ' ' });
    notification.listeners.get('keydown')({ key: 'Escape' });
    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(3);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'OPEN_POPUP' });
  });
});
