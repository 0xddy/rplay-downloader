import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function event() {
  const listeners = [];
  return {
    addListener: vi.fn((listener) => listeners.push(listener)),
    emit: (...args) => listeners.forEach((listener) => listener(...args)),
  };
}

function storage() {
  const values = {};
  return {
    get: vi.fn(async (key) => ({ [key]: values[key] })),
    set: vi.fn(async (entries) => Object.assign(values, entries)),
    remove: vi.fn(async (key) => { delete values[key]; }),
  };
}

describe('background media detection', () => {
  let chrome;
  let fetchFn;
  const masterUrl = 'https://pb3.rplay.live/example/master.m3u8';
  const trackUrl = 'https://pb3.rplay.live/example/video.cmfv';
  const request = (url = masterUrl) => ({ url, tabId: 7, type: 'media', method: 'GET' });
  const getVideos = () => new Promise((resolve) => {
    chrome.runtime.onMessage.emit({ type: 'GET_VIDEO_INFO', tabId: 7 }, {}, resolve);
  });

  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    chrome = {
      storage: { local: storage(), session: storage() },
      webRequest: { onBeforeRequest: event() },
      tabs: {
        onRemoved: event(), onUpdated: event(),
        sendMessage: vi.fn(async () => ({ title: 'Example video | RPLAY' })),
        get: vi.fn(async () => ({ title: 'Example video | RPLAY' })),
      },
      action: { setBadgeText: vi.fn(async () => {}), setBadgeBackgroundColor: vi.fn(async () => {}) },
      downloads: { onDeterminingFilename: event(), onChanged: event() },
      runtime: { onMessage: event(), sendMessage: vi.fn(async () => {}) },
    };
    fetchFn = vi.fn(async (url) => new Response(url === masterUrl
      ? '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=1920x1080\nvideo.m3u8'
      : '#EXTM3U\n#EXT-X-MAP:URI="video.cmfv",BYTERANGE="100@0"\n'
        + '#EXTINF:5,\n#EXT-X-BYTERANGE:200@100\nvideo.cmfv\n#EXT-X-ENDLIST'));
    vi.stubGlobal('chrome', chrome);
    vi.stubGlobal('fetch', fetchFn);
    await import('../src/background.js');
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('detects CDN media requests, replaces CMAF notices and updates the popup', async () => {
    chrome.webRequest.onBeforeRequest.emit(request(trackUrl));
    await vi.advanceTimersByTimeAsync(500);
    expect((await getVideos()).videos[0].unavailableReason).toBe('cmafNeedsPlaylist');
    expect(fetchFn).not.toHaveBeenCalled();
    chrome.webRequest.onBeforeRequest.emit(request());
    await vi.advanceTimersByTimeAsync(500);
    const { videos } = await getVideos();
    expect(videos).toHaveLength(1);
    expect(videos[0].streams[0]).toMatchObject({ resolution: '1920x1080', unavailableReason: null });
    expect(chrome.runtime.sendMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      type: 'VIDEO_DETECTED', tabId: 7, data: expect.objectContaining({ sourceType: 'hls' }),
    }));
    chrome.webRequest.onBeforeRequest.emit(request());
    chrome.webRequest.onBeforeRequest.emit(request(trackUrl));
    chrome.webRequest.onBeforeRequest.emit(request('https://pb3.rplay.live/example/video.m3u8'));
    await vi.advanceTimersByTimeAsync(4000);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect((await getVideos()).videos).toHaveLength(1);
  });

  it('discards pending detection after navigation and can rediscover the same URL', async () => {
    let resolveFetch;
    fetchFn.mockImplementationOnce(() => new Promise((resolve) => { resolveFetch = resolve; }));
    chrome.webRequest.onBeforeRequest.emit(request());
    await vi.advanceTimersByTimeAsync(500);
    chrome.tabs.onUpdated.emit(7, { url: 'https://rplay.live/play/another-video' });
    resolveFetch(new Response('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1,RESOLUTION=1920x1080\nvideo.m3u8'));
    await vi.advanceTimersByTimeAsync(0);
    expect((await getVideos()).videos).toEqual([]);
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    chrome.webRequest.onBeforeRequest.emit(request());
    await vi.advanceTimersByTimeAsync(500);
    expect((await getVideos()).videos).toHaveLength(1);
  });

  it('does not recreate a closed tab from a delayed request', async () => {
    chrome.webRequest.onBeforeRequest.emit(request());
    chrome.tabs.onRemoved.emit(7);
    await vi.advanceTimersByTimeAsync(500);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it('rejects a download for a known unsupported source before queueing it', async () => {
    chrome.webRequest.onBeforeRequest.emit(request(trackUrl));
    await vi.advanceTimersByTimeAsync(500);
    const response = await new Promise((resolve) => {
      chrome.runtime.onMessage.emit({ type: 'DOWNLOAD_VIDEO', tabId: 7, data: {
        masterUrl: trackUrl, streamUrl: trackUrl, resolution: '1920x1080',
      } }, {}, resolve);
    });
    expect(response).toMatchObject({ success: false });
    expect(chrome.storage.session.set).not.toHaveBeenCalled();
  });

  it.each(['dash-first', 'cmaf-first'])('shows one DASH entry when playback produces no HLS (%s)', async (order) => {
    const dashUrl = 'https://pb3.rplay.live/example/manifest.mpd';
    fetchFn.mockImplementation(async () => new Response('<MPD mediaPresentationDuration="PT60S">'
      + '<Period><AdaptationSet><ContentProtection schemeIdUri="urn:mpeg:dash:mp4protection:2011" value="cbcs"/>'
      + '<Representation><BaseURL>video.cmfv</BaseURL><SegmentBase indexRange="100-200"/></Representation>'
      + '</AdaptationSet></Period></MPD>'));
    for (const url of order === 'dash-first' ? [dashUrl, trackUrl] : [trackUrl, dashUrl]) {
      chrome.webRequest.onBeforeRequest.emit(request(url));
      await vi.advanceTimersByTimeAsync(500);
    }
    const { videos } = await getVideos();
    expect(videos).toHaveLength(1);
    expect(videos[0]).toMatchObject({ sourceType: 'dash', unavailableReason: null, duration: 60 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0][0]).toBe(dashUrl);
  });

  it('routes a detected DASH quality through the existing download task and offscreen worker', async () => {
    const dashUrl = 'https://pb3.rplay.live/example/manifest.mpd';
    fetchFn.mockImplementation(async () => new Response('<MPD type="static"><Period>'
      + '<AdaptationSet contentType="video"><Representation id="v" width="160" height="90" bandwidth="100000">'
      + '<BaseURL>video.cmfv</BaseURL><SegmentBase/></Representation></AdaptationSet>'
      + '<AdaptationSet contentType="audio"><Representation id="a"><BaseURL>audio.cmfa</BaseURL><SegmentBase/>'
      + '</Representation></AdaptationSet></Period></MPD>'));
    chrome.runtime.getURL = (path) => `chrome-extension://test/${path}`;
    chrome.runtime.getContexts = vi.fn(async () => [{}]);
    chrome.runtime.sendMessage.mockImplementation(async (message) => message.type === 'OFFSCREEN_START' ? { accepted: true } : undefined);
    chrome.webRequest.onBeforeRequest.emit(request(dashUrl));
    await vi.advanceTimersByTimeAsync(500);
    const { videos: [video] } = await getVideos();
    const [stream] = video.streams;
    const licenseUrl = 'https://widevine-dash.ezdrm.com/widevine-php/widevine-foreignkey.php?token=synthetic';
    chrome.webRequest.onBeforeRequest.emit({ url: licenseUrl, tabId: 7, method: 'POST', initiator: 'https://rplay.live' });
    expect(stream.unavailableReason).toBeNull();
    const response = await new Promise((resolve) => chrome.runtime.onMessage.emit({
      type: 'DOWNLOAD_VIDEO', tabId: 7, data: { ...stream, sourceType: 'dash', masterUrl: dashUrl, streamUrl: stream.url },
    }, {}, resolve));
    expect(response.success).toBe(true);
    expect(response.task.licenseUrl).toBeUndefined();
    expect(response.task.cdmSettings).toBeUndefined();
    await vi.advanceTimersByTimeAsync(0);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'OFFSCREEN_START', task: expect.objectContaining({
        sourceType: 'dash', streamUrl: trackUrl, audioUrl: 'https://pb3.rplay.live/example/audio.cmfa',
        representationId: 'v', audioRepresentationId: 'a', requestedFormat: 'mp4',
        licenseUrl,
      }),
    }));
  });

  it('isolates license capture by tab and clears it on navigation', async () => {
    const url = 'https://widevine-dash.ezdrm.com/widevine-php/widevine-foreignkey.php?token=synthetic';
    chrome.webRequest.onBeforeRequest.emit({ url, tabId: 7, method: 'POST', initiator: 'https://unrelated.test' });
    expect((await chrome.storage.session.get('rplayWidevine:7'))['rplayWidevine:7']).toBeUndefined();
    chrome.webRequest.onBeforeRequest.emit({ url, tabId: 7, method: 'POST', initiator: 'https://rplay.live' });
    expect((await chrome.storage.session.get('rplayWidevine:7'))['rplayWidevine:7']).toBe(url);
    expect((await chrome.storage.session.get('rplayWidevine:8'))['rplayWidevine:8']).toBeUndefined();
    chrome.tabs.onUpdated.emit(7, { url: 'https://rplay.live/play/another' });
    expect((await chrome.storage.session.get('rplayWidevine:7'))['rplayWidevine:7']).toBeUndefined();
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });
});
