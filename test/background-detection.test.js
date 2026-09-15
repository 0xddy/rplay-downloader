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
  const request = (url = masterUrl, tabId = 7) => ({ url, tabId, type: 'media', method: 'GET' });
  const getVideos = (tabId = 7) => new Promise((resolve) => {
    chrome.runtime.onMessage.emit({ type: 'GET_VIDEO_INFO', tabId }, {}, resolve);
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

  it('coalesces distinct segment filenames and signed URLs without redetecting or recollecting the page title', async () => {
    const urls = [
      'https://pb3.rplay.live/example/video_001.cmfv?token=first',
      'https://pb3.rplay.live/example/video_002.cmfv?token=second',
      'https://pb3.rplay.live/example/video_002.cmfv?token=renewed',
      'https://pb3.rplay.live/another-track/unique-segment.cmfv?range=300-399',
    ];
    chrome.webRequest.onBeforeRequest.emit(request(urls[0]));
    await vi.advanceTimersByTimeAsync(500);
    const { videos: [first] } = await getVideos();
    chrome.tabs.sendMessage.mockImplementation(async (tabId, message) => (
      message.type === 'GET_PAGE_VIDEO_TITLE' ? { title: 'Changed title | RPLAY' } : undefined
    ));
    for (const url of urls.slice(1)) {
      chrome.webRequest.onBeforeRequest.emit(request(url));
      await vi.advanceTimersByTimeAsync(500);
    }
    const { videos } = await getVideos();
    expect(videos).toHaveLength(1);
    expect(videos[0]).toMatchObject({
      baseUrl: urls[0], title: first.title, timestamp: first.timestamp,
      sourceType: 'cmaf', unavailableReason: 'cmafNeedsPlaylist', observedUrls: urls, relatedUrls: urls,
    });
    expect(chrome.tabs.sendMessage.mock.calls.filter(([, message]) => message.type === 'GET_PAGE_VIDEO_TITLE')).toHaveLength(1);
    expect(chrome.tabs.get).not.toHaveBeenCalled();
    expect(chrome.runtime.sendMessage.mock.calls.filter(([message]) => message.type === 'VIDEO_DETECTED')).toHaveLength(1);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
    expect(chrome.action.setBadgeText).toHaveBeenCalledTimes(1);
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ tabId: 7, text: '1' });
    expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledTimes(1);
    expect(fetchFn).not.toHaveBeenCalled();
    const stored = (await chrome.storage.local.get('rplayVideos:7'))['rplayVideos:7'];
    expect(stored).toEqual(videos);
    for (const url of urls) chrome.webRequest.onBeforeRequest.emit(request(url));
    await vi.advanceTimersByTimeAsync(4000);
    expect(chrome.storage.local.set).toHaveBeenCalledTimes(urls.length);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('shares the first CMAF title request across simultaneous segments and only emits one detection', async () => {
    let finishTitle;
    chrome.tabs.sendMessage.mockImplementation(async (tabId, message) => (
      message.type === 'GET_PAGE_VIDEO_TITLE'
        ? new Promise((resolve) => { finishTitle = resolve; }) : undefined
    ));
    const urls = [trackUrl, `${trackUrl}?segment=2`, `${trackUrl}?segment=3`];
    for (const url of urls) chrome.webRequest.onBeforeRequest.emit(request(url));
    await vi.advanceTimersByTimeAsync(500);
    expect((await getVideos()).videos).toEqual([]);
    expect(chrome.tabs.sendMessage.mock.calls.filter(([, message]) => message.type === 'GET_PAGE_VIDEO_TITLE')).toHaveLength(1);
    finishTitle({ title: 'Shared title | RPLAY' });
    await vi.advanceTimersByTimeAsync(0);
    expect((await getVideos()).videos).toEqual([expect.objectContaining({ title: 'Shared title', observedUrls: urls })]);
    expect(chrome.runtime.sendMessage.mock.calls.filter(([message]) => message.type === 'VIDEO_DETECTED')).toHaveLength(1);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
    expect(chrome.action.setBadgeText).toHaveBeenCalledTimes(1);
  });

  it.each(['manifest-first', 'segments-first'])('associates multiple exact signed segments with one HLS entry (%s)', async (order) => {
    const urls = [
      'https://pb3.rplay.live/example/video_001.cmfv?token=one',
      'https://pb3.rplay.live/example/video_002.cmfv?token=two',
    ];
    fetchFn.mockImplementation(async (url) => new Response(url === masterUrl
      ? '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=1920x1080\nvideo.m3u8'
      : '#EXTM3U\n#EXT-X-MAP:URI="video_001.cmfv?token=one"\n#EXTINF:5,\nvideo_001.cmfv?token=one\n'
        + '#EXTINF:5,\nvideo_002.cmfv?token=two\n#EXT-X-ENDLIST'));
    for (const url of order === 'manifest-first' ? [masterUrl, ...urls] : [...urls, masterUrl]) {
      chrome.webRequest.onBeforeRequest.emit(request(url));
      await vi.advanceTimersByTimeAsync(500);
    }
    const { videos } = await getVideos();
    expect(videos).toHaveLength(1);
    expect(videos[0]).toMatchObject({ sourceType: 'hls', baseUrl: masterUrl });
    expect(videos[0].relatedUrls).toEqual(expect.arrayContaining(urls));
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(chrome.runtime.sendMessage.mock.calls.filter(([message]) => message.type === 'VIDEO_DETECTED'))
      .toHaveLength(order === 'manifest-first' ? 1 : 2);
    expect(chrome.tabs.sendMessage.mock.calls.filter(([, message]) => message.type === 'GET_PAGE_VIDEO_TITLE'))
      .toHaveLength(order === 'manifest-first' ? 1 : 2);
    expect(chrome.action.setBadgeText).toHaveBeenCalledTimes(1);
  });

  it.each(['manifest-first', 'segments-first'])('keeps unmatched observations when a manifest only references part of a CMAF group (%s)', async (order) => {
    const unknown = `${trackUrl}?segment=unreferenced`;
    const urls = order === 'manifest-first' ? [masterUrl, trackUrl, unknown] : [trackUrl, unknown, masterUrl];
    for (const url of urls) {
      chrome.webRequest.onBeforeRequest.emit(request(url));
      await vi.advanceTimersByTimeAsync(500);
    }
    const { videos } = await getVideos();
    expect(videos).toHaveLength(2);
    const notice = videos.find((video) => video.sourceType === 'cmaf');
    expect(notice).toMatchObject({ baseUrl: unknown, unavailableReason: 'cmafNeedsPlaylist' });
    expect(notice.relatedUrls).toEqual([unknown]);
    expect(videos.find((video) => video.sourceType === 'hls').relatedUrls).toContain(trackUrl);
    const newerUnknown = `${trackUrl}?segment=still-unreferenced`;
    const detectedCount = chrome.runtime.sendMessage.mock.calls.filter(([message]) => message.type === 'VIDEO_DETECTED').length;
    const titleCount = chrome.tabs.sendMessage.mock.calls.filter(([, message]) => message.type === 'GET_PAGE_VIDEO_TITLE').length;
    chrome.webRequest.onBeforeRequest.emit(request(newerUnknown));
    await vi.advanceTimersByTimeAsync(500);
    const updated = (await getVideos()).videos.find((video) => video.sourceType === 'cmaf');
    expect(updated).toMatchObject({
      baseUrl: unknown, title: notice.title, timestamp: notice.timestamp, observedUrls: [unknown, newerUnknown],
    });
    expect(chrome.runtime.sendMessage.mock.calls.filter(([message]) => message.type === 'VIDEO_DETECTED')).toHaveLength(detectedCount);
    expect(chrome.tabs.sendMessage.mock.calls.filter(([, message]) => message.type === 'GET_PAGE_VIDEO_TITLE')).toHaveLength(titleCount);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(detectedCount);
    expect(chrome.action.setBadgeText).toHaveBeenCalledTimes(2);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('normalizes previously persisted CMAF entries when the popup restores its list', async () => {
    const urls = [trackUrl, `${trackUrl}?segment=2`, `${trackUrl}?segment=3`];
    const entries = urls.map((baseUrl, index) => ({
      baseUrl, relatedUrls: [baseUrl], title: `Old title ${index}`, timestamp: index + 1,
      sourceType: 'cmaf', streams: [], unavailableReason: 'cmafNeedsPlaylist',
    }));
    const manifest = { sourceType: 'hls', baseUrl: masterUrl, title: 'Manifest', streams: [{ url: masterUrl }] };
    await chrome.storage.local.set({ 'rplayVideos:7': [entries[0], manifest, ...entries.slice(1)] });
    const { videos } = await getVideos();
    expect(videos).toEqual([
      expect.objectContaining({ title: 'Old title 0', timestamp: 1, observedUrls: urls, relatedUrls: urls }), manifest,
    ]);
    expect((await getVideos()).videos).toBe(videos);
    chrome.webRequest.onBeforeRequest.emit(request(`${trackUrl}?segment=4`));
    await vi.advanceTimersByTimeAsync(500);
    expect((await getVideos()).videos).toHaveLength(2);
    expect(chrome.tabs.sendMessage.mock.calls.filter(([, message]) => message.type === 'GET_PAGE_VIDEO_TITLE')).toHaveLength(0);
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    expect(chrome.action.setBadgeText).not.toHaveBeenCalled();
  });

  it('clears grouped observations and title collection on refresh so the same segments are detected anew', async () => {
    const urls = [trackUrl, `${trackUrl}?segment=2`];
    for (const url of urls) {
      chrome.webRequest.onBeforeRequest.emit(request(url));
      await vi.advanceTimersByTimeAsync(500);
    }
    const first = (await getVideos()).videos[0];
    chrome.tabs.onUpdated.emit(7, { status: 'loading' });
    expect((await getVideos()).videos).toEqual([]);
    chrome.tabs.sendMessage.mockImplementation(async (tabId, message) => (
      message.type === 'GET_PAGE_VIDEO_TITLE' ? { title: 'Reloaded title | RPLAY' } : undefined
    ));
    for (const url of urls) {
      chrome.webRequest.onBeforeRequest.emit(request(url));
      await vi.advanceTimersByTimeAsync(500);
    }
    const { videos } = await getVideos();
    expect(videos).toEqual([expect.objectContaining({ title: 'Reloaded title', observedUrls: urls })]);
    expect(videos[0].timestamp).toBeGreaterThan(first.timestamp);
    expect(chrome.tabs.sendMessage.mock.calls.filter(([, message]) => message.type === 'GET_PAGE_VIDEO_TITLE')).toHaveLength(2);
    expect(chrome.runtime.sendMessage.mock.calls.filter(([message]) => message.type === 'VIDEO_DETECTED')).toHaveLength(2);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(3);
    expect((await chrome.storage.local.get('rplayVideos:7'))['rplayVideos:7']).toEqual(videos);
  });

  it('keeps CMAF groups, title requests and refresh cleanup independent between tabs', async () => {
    chrome.tabs.sendMessage.mockImplementation(async (tabId, message) => (
      message.type === 'GET_PAGE_VIDEO_TITLE' ? { title: `Video in tab ${tabId} | RPLAY` } : undefined
    ));
    const urls = [trackUrl, `${trackUrl}?segment=2`];
    for (const tabId of [7, 8]) {
      for (const url of urls) chrome.webRequest.onBeforeRequest.emit(request(url, tabId));
    }
    await vi.advanceTimersByTimeAsync(500);
    expect((await getVideos(7)).videos).toEqual([expect.objectContaining({ title: 'Video in tab 7', observedUrls: urls })]);
    const otherTab = (await getVideos(8)).videos;
    expect(otherTab).toEqual([expect.objectContaining({ title: 'Video in tab 8', observedUrls: urls })]);
    expect(chrome.tabs.sendMessage.mock.calls.filter(([, message]) => message.type === 'GET_PAGE_VIDEO_TITLE')).toHaveLength(2);
    expect(chrome.runtime.sendMessage.mock.calls.filter(([message]) => message.type === 'VIDEO_DETECTED')).toHaveLength(2);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(2);
    chrome.tabs.onUpdated.emit(7, { status: 'loading' });
    await vi.advanceTimersByTimeAsync(0);
    expect((await getVideos(7)).videos).toEqual([]);
    expect((await getVideos(8)).videos).toEqual(otherTab);
    expect((await chrome.storage.local.get('rplayVideos:8'))['rplayVideos:8']).toEqual(otherTab);
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
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'VIDEO_DETECTED' }));
    chrome.webRequest.onBeforeRequest.emit(request());
    await vi.advanceTimersByTimeAsync(500);
    expect((await getVideos()).videos).toHaveLength(1);
  });

  it.each([
    { status: 'loading' },
    { status: 'loading', url: 'https://rplay.live/play/current-video' },
  ])('clears detected media on refresh and rediscovers cached URLs (%j)', async (changeInfo) => {
    chrome.webRequest.onBeforeRequest.emit(request());
    await vi.advanceTimersByTimeAsync(500);
    expect((await getVideos()).videos).toHaveLength(1);
    chrome.runtime.sendMessage.mockClear();
    chrome.tabs.onUpdated.emit(7, changeInfo);
    expect((await getVideos()).videos).toEqual([]);
    expect((await chrome.storage.local.get('rplayVideos:7'))['rplayVideos:7']).toBeUndefined();
    expect(chrome.action.setBadgeText).toHaveBeenLastCalledWith({ tabId: 7, text: '' });
    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'VIDEO_INFO_CLEARED', tabId: 7 });
    chrome.webRequest.onBeforeRequest.emit(request());
    await vi.advanceTimersByTimeAsync(500);
    expect((await getVideos()).videos).toHaveLength(1);
    expect(fetchFn).toHaveBeenCalledTimes(4);
    chrome.tabs.onUpdated.emit(7, { status: 'complete' });
    expect((await getVideos()).videos).toHaveLength(1);
  });

  it('invalidates both scheduled and in-flight detection on same-URL reload', async () => {
    chrome.webRequest.onBeforeRequest.emit(request(trackUrl));
    chrome.tabs.onUpdated.emit(7, { status: 'loading' });
    await vi.advanceTimersByTimeAsync(500);
    expect((await getVideos()).videos).toEqual([]);
    let resolveFetch;
    fetchFn.mockImplementationOnce(() => new Promise((resolve) => { resolveFetch = resolve; }));
    chrome.webRequest.onBeforeRequest.emit(request());
    await vi.advanceTimersByTimeAsync(500);
    chrome.tabs.onUpdated.emit(7, { status: 'loading' });
    resolveFetch(new Response('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1,RESOLUTION=1920x1080\nvideo.m3u8'));
    await vi.advanceTimersByTimeAsync(0);
    expect((await getVideos()).videos).toEqual([]);
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'VIDEO_DETECTED' }));
  });

  it('does not restore a stale storage read that finishes after refresh', async () => {
    let resolveRead;
    chrome.storage.local.get.mockImplementationOnce(() => new Promise((resolve) => { resolveRead = resolve; }));
    const pendingVideos = getVideos();
    await vi.advanceTimersByTimeAsync(0);
    chrome.tabs.onUpdated.emit(7, { status: 'loading' });
    resolveRead({ 'rplayVideos:7': [{ baseUrl: trackUrl, title: 'Old page' }] });
    expect((await pendingVideos).videos).toEqual([]);
    expect((await getVideos()).videos).toEqual([]);
  });

  it('removes a detection write that was already in flight when refresh began', async () => {
    let finishWrite;
    const originalSet = chrome.storage.local.set.getMockImplementation();
    chrome.storage.local.set.mockImplementationOnce((entries) => new Promise((resolve) => {
      finishWrite = () => originalSet(entries).then(resolve);
    }));
    chrome.webRequest.onBeforeRequest.emit(request(trackUrl));
    await vi.advanceTimersByTimeAsync(500);
    chrome.tabs.onUpdated.emit(7, { status: 'loading' });
    expect((await getVideos()).videos).toEqual([]);
    expect(chrome.storage.local.remove).not.toHaveBeenCalled();
    finishWrite();
    await vi.advanceTimersByTimeAsync(0);
    expect((await chrome.storage.local.get('rplayVideos:7'))['rplayVideos:7']).toBeUndefined();
    expect((await getVideos()).videos).toEqual([]);
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'VIDEO_DETECTED' }));
    expect(chrome.action.setBadgeText).toHaveBeenLastCalledWith({ tabId: 7, text: '' });
  });

  it('persists new-page detection after old writes and cleanup, even after a write failure', async () => {
    let finishWrite;
    chrome.storage.local.set.mockImplementationOnce(() => new Promise((_resolve, reject) => {
      finishWrite = () => reject(new Error('Simulated old-page write failure'));
    }));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    chrome.webRequest.onBeforeRequest.emit(request(trackUrl));
    await vi.advanceTimersByTimeAsync(500);
    chrome.tabs.onUpdated.emit(7, { status: 'loading' });
    chrome.webRequest.onBeforeRequest.emit(request());
    await vi.advanceTimersByTimeAsync(500);
    finishWrite();
    await vi.advanceTimersByTimeAsync(0);
    const { videos } = await getVideos();
    expect(videos).toHaveLength(1);
    expect(videos[0].sourceType).toBe('hls');
    expect((await chrome.storage.local.get('rplayVideos:7'))['rplayVideos:7']).toEqual(videos);
    expect(chrome.runtime.sendMessage.mock.calls.filter(([message]) => message.type === 'VIDEO_DETECTED')).toHaveLength(1);
    expect(chrome.storage.local.remove.mock.invocationCallOrder[0]).toBeLessThan(chrome.storage.local.set.mock.invocationCallOrder[1]);
    consoleError.mockRestore();
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
    const downloadBadge = chrome.action.setBadgeText.mock.calls.length;
    chrome.tabs.onUpdated.emit(7, { status: 'loading' });
    expect((await getVideos()).videos).toEqual([]);
    const state = await new Promise((resolve) => chrome.runtime.onMessage.emit({
      type: 'GET_TASKS',
    }, {}, resolve));
    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0]).toMatchObject({ taskId: response.task.taskId, phase: 'preparing' });
    expect(state.activeTaskId).toBe(response.task.taskId);
    expect(chrome.action.setBadgeText).toHaveBeenCalledTimes(downloadBadge);
    expect(chrome.runtime.sendMessage.mock.calls.filter(([message]) => message.type === 'OFFSCREEN_START')).toHaveLength(1);
  });

  it('isolates license capture by tab and clears it on navigation', async () => {
    const url = 'https://widevine-dash.ezdrm.com/widevine-php/widevine-foreignkey.php?token=synthetic';
    chrome.webRequest.onBeforeRequest.emit({ url, tabId: 7, method: 'POST', initiator: 'https://unrelated.test' });
    expect((await chrome.storage.session.get('rplayWidevine:7'))['rplayWidevine:7']).toBeUndefined();
    chrome.webRequest.onBeforeRequest.emit({ url, tabId: 7, method: 'POST', initiator: 'https://rplay.live' });
    expect((await chrome.storage.session.get('rplayWidevine:7'))['rplayWidevine:7']).toBe(url);
    expect((await chrome.storage.session.get('rplayWidevine:8'))['rplayWidevine:8']).toBeUndefined();
    chrome.tabs.onUpdated.emit(7, { url: 'https://rplay.live/play/another' });
    await vi.advanceTimersByTimeAsync(0);
    expect((await chrome.storage.session.get('rplayWidevine:7'))['rplayWidevine:7']).toBeUndefined();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'VIDEO_INFO_CLEARED', tabId: 7 });
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'VIDEO_DETECTED' }));
  });

  it('cleans up delayed old license writes before preserving the new-page license', async () => {
    let finishWrite;
    const originalSet = chrome.storage.session.set.getMockImplementation();
    chrome.storage.session.set.mockImplementationOnce((entries) => new Promise((resolve) => {
      finishWrite = () => originalSet(entries).then(resolve);
    }));
    const licenseUrl = 'https://widevine-dash.ezdrm.com/widevine-php/widevine-foreignkey.php?token=';
    const capture = (token, tabId = 7) => chrome.webRequest.onBeforeRequest.emit({
      url: `${licenseUrl}${token}`, tabId, method: 'POST', initiator: 'https://rplay.live',
    });
    capture('old');
    capture('other-tab', 8);
    chrome.tabs.onUpdated.emit(7, { status: 'loading' });
    capture('new');
    finishWrite();
    await vi.advanceTimersByTimeAsync(0);
    expect((await chrome.storage.session.get('rplayWidevine:7'))['rplayWidevine:7']).toBe(`${licenseUrl}new`);
    expect((await chrome.storage.session.get('rplayWidevine:8'))['rplayWidevine:8']).toBe(`${licenseUrl}other-tab`);
    expect(chrome.storage.session.remove.mock.invocationCallOrder[0]).toBeLessThan(chrome.storage.session.set.mock.invocationCallOrder[2]);
  });

  it('waits for queued license capture before starting a download', async () => {
    let finishWrite;
    const originalSet = chrome.storage.local.set.getMockImplementation();
    chrome.storage.local.set.mockImplementationOnce((entries) => new Promise((resolve) => {
      finishWrite = () => originalSet(entries).then(resolve);
    }));
    chrome.runtime.getURL = (path) => `chrome-extension://test/${path}`;
    chrome.runtime.getContexts = vi.fn(async () => [{}]);
    chrome.runtime.sendMessage.mockImplementation(async (message) => message.type === 'OFFSCREEN_START' ? { accepted: true } : undefined);
    chrome.webRequest.onBeforeRequest.emit(request());
    await vi.advanceTimersByTimeAsync(500);
    const { videos: [video] } = await getVideos();
    const [stream] = video.streams;
    const licenseUrl = 'https://widevine-dash.ezdrm.com/widevine-php/widevine-foreignkey.php?token=synthetic';
    chrome.webRequest.onBeforeRequest.emit({ url: licenseUrl, tabId: 7, method: 'POST', initiator: 'https://rplay.live' });
    const pendingDownload = new Promise((resolve) => chrome.runtime.onMessage.emit({
      type: 'DOWNLOAD_VIDEO', tabId: 7, data: {
        ...stream, title: 'Example', masterUrl, streamUrl: stream.url,
      },
    }, {}, resolve));
    await vi.advanceTimersByTimeAsync(0);
    expect(chrome.storage.session.get).not.toHaveBeenCalledWith('rplayWidevine:7');
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'OFFSCREEN_START' }));
    finishWrite();
    expect((await pendingDownload).success).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'OFFSCREEN_START', task: expect.objectContaining({ licenseUrl }),
    }));
  });
});
