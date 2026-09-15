import { describe, expect, it, vi } from 'vitest';
import {
  coalesceCmafObservations,
  getRPlaySourceType,
  inspectVideoSource,
  isCmafTrackOnlySource,
  isKnownVideoSource,
  isRPlayMasterUrl,
  mergeVideoSources,
  shouldInspectMediaRequest,
} from '../src/video-detector.js';

const cmafObservation = (url, timestamp = 1) => ({
  sourceType: 'cmaf', title: 'Page video', timestamp,
  baseUrl: url, relatedUrls: [url], streams: [], unavailableReason: 'cmafNeedsPlaylist',
});

describe('RPlay video detector', () => {
  it('recognizes supported master endpoints', () => {
    expect(isRPlayMasterUrl(
      'https://api2.rplay.live/content/hlsstream?s3key=media/example/master.m3u8',
    )).toBe(true);
    expect(isRPlayMasterUrl('https://example.test/master.m3u8')).toBe(false);
  });

  it.each([
    'https://api.rplay.live/content/hlsstream?key=media/hls/master.m3u8',
    'https://api2.rplay.live/content/hlsstream?token=test&s3key=media%2Fexample%2Fmaster.m3u8',
    'https://api.rplay-cdn.com/content/hlsstream?s3key=media%2Fmaster%2Em3u8',
    'https://pb3.rplay.live/jp/mp4/example/master.m3u8?signature=test',
    'https://media.rplay-cdn.com/path/MASTER.M3U8',
  ])('recognizes HLS on supported endpoints and CDNs: %s', (url) => {
    expect(isRPlayMasterUrl(url)).toBe(true);
  });

  it.each([
    'https://rplay.live.example.test/master.m3u8',
    'https://evilrplay.live/master.m3u8',
    'https://example.test/file?url=https://pb3.rplay.live/master.m3u8',
    'https://pb3.rplay.live/master.m3u8.png',
    'https://pb3.rplay.live/image.jpg?name=master.m3u8',
    'file://rplay.live/master.m3u8',
    'not a URL',
  ])('ignores unrelated or malformed URLs: %s', (url) => {
    expect(getRPlaySourceType(url)).toBeNull();
  });

  it('observes media requests and ignores extension fetches and non-GET requests', () => {
    const request = { url: 'https://pb3.rplay.live/example/master.m3u8', tabId: 1, type: 'media' };
    expect(shouldInspectMediaRequest(request)).toBe(true);
    expect(shouldInspectMediaRequest({ ...request, tabId: -1 })).toBe(false);
    expect(shouldInspectMediaRequest({ ...request, type: 'image' })).toBe(false);
    expect(shouldInspectMediaRequest({ ...request, method: 'POST' })).toBe(false);
  });

  it('reports CMAF and DASH without downloading media or pretending they are HLS', async () => {
    const fetchFn = vi.fn(async () => new Response('<MPD type="static"><Period/></MPD>'));
    const cmaf = await inspectVideoSource('https://pb3.rplay.live/example/video_2.cmfv', { fetchFn });
    expect(fetchFn).not.toHaveBeenCalled();
    const dash = await inspectVideoSource('https://pb3.rplay.live/example/manifest.mpd', { fetchFn });
    expect(cmaf).toMatchObject({ sourceType: 'cmaf', streams: [], unavailableReason: 'cmafNeedsPlaylist' });
    expect(dash).toMatchObject({ sourceType: 'dash', streams: [], unavailableReason: 'dashUnsupported' });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0][0]).toBe(dash.baseUrl);
  });

  it('returns normalized video metadata while keeping duration optional', async () => {
    const masterUrl = 'https://api2.rplay.live/content/hlsstream?s3key=media/example/master.m3u8';
    const master = [
      '#EXTM3U',
      '#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=1920x1080',
      'video.m3u8',
    ].join('\n');
    const media = '#EXTM3U\n#EXTINF:4,\n0.ts\n#EXTINF:6,\n1.ts\n#EXT-X-ENDLIST';
    const fetchFn = vi.fn(async (url) => new Response(url === masterUrl ? master : media));

    const detected = await inspectVideoSource(masterUrl, {
      fetchFn,
      resolveTitle: async () => '  视频标题 | RPLAY  ',
      now: () => 123,
    });

    expect(detected.title).toBe('视频标题');
    expect(detected.duration).toBe(10);
    expect(detected.streams).toHaveLength(1);
    expect(detected.timestamp).toBe(123);
  });

  it('validates playlist content and ignores child media playlists', async () => {
    for (const body of ['<html>Login</html>', '#EXTM3U\n#EXTINF:4,\nvideo.cmfv\n#EXT-X-ENDLIST']) {
      const fetchFn = vi.fn(async () => new Response(body));
      expect(await inspectVideoSource('https://pb3.rplay.live/master.m3u8', { fetchFn })).toBeNull();
      expect(fetchFn).toHaveBeenCalledTimes(1);
    }
  });

  it('keeps sources visible when optional playlist or title inspection fails', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(new Response('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\na.m3u8'))
      .mockRejectedValue(new Error('offline'));
    const detected = await inspectVideoSource('https://pb3.rplay.live/master.m3u8', {
      fetchFn, resolveTitle: async () => { throw new Error('tab closed'); },
    });
    expect(detected).toMatchObject({ title: 'rplay', duration: null });
    expect(detected.streams).toHaveLength(1);
  });

  it('resolves redirected manifests and pairs shared audio without duplicate fetches', async () => {
    const requested = 'https://api2.rplay.live/content/hlsstream?s3key=example';
    const master = new Response('#EXTM3U\n'
      + '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",URI="audio.m3u8"\n'
      + '#EXT-X-STREAM-INF:BANDWIDTH=100,RESOLUTION=1280x720,AUDIO="audio"\n720.m3u8\n'
      + '#EXT-X-STREAM-INF:BANDWIDTH=200,RESOLUTION=1920x1080,AUDIO="audio"\n1080.m3u8');
    Object.defineProperty(master, 'url', { value: 'https://pb3.rplay.live/media/master.m3u8' });
    const fetchFn = vi.fn(async (url) => {
      if (url === requested) return master;
      return new Response('#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:5,\npart.cmfv\n#EXT-X-ENDLIST');
    });
    const detected = await inspectVideoSource(requested, { fetchFn });
    expect(detected.streams[0].url).toBe('https://pb3.rplay.live/media/720.m3u8');
    expect(detected.duration).toBe(5);
    expect(detected.relatedUrls).toEqual(expect.arrayContaining([
      'https://pb3.rplay.live/media/master.m3u8',
      'https://pb3.rplay.live/media/audio.m3u8',
      'https://pb3.rplay.live/media/init.mp4',
      'https://pb3.rplay.live/media/part.cmfv',
    ]));
    expect(fetchFn).toHaveBeenCalledTimes(4);
    expect(detected.streams.every((stream) => !stream.unavailableReason)).toBe(true);
  });

  it.each(['master', 'video', 'audio'])('marks protection declared in the %s playlist', async (location) => {
    const base = 'https://pb3.rplay.live/example/';
    const masterKey = '#EXT-X-SESSION-KEY:METHOD=SAMPLE-AES,URI="skd://example",KEYFORMAT="com.apple.streamingkeydelivery"\n';
    const mediaKey = '#EXT-X-KEY:METHOD=SAMPLE-AES,URI="key"\n';
    const master = '#EXTM3U\n' + (location === 'master' ? masterKey : '')
      + '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",URI="audio.m3u8"\n'
      + '#EXT-X-STREAM-INF:BANDWIDTH=100,RESOLUTION=1920x1080,AUDIO="a"\nvideo.m3u8';
    const fetchFn = vi.fn(async (url) => {
      if (url === `${base}master.m3u8`) return new Response(master);
      const protectedTrack = url.endsWith(`${location}.m3u8`);
      return new Response('#EXTM3U\n' + (protectedTrack ? mediaKey : '')
        + '#EXT-X-MAP:URI="init.mp4"\n#EXTINF:5,\npart.cmfv\n#EXT-X-ENDLIST');
    });
    const detected = await inspectVideoSource(`${base}master.m3u8`, { fetchFn });
    expect(detected.streams[0].unavailableReason).toBe('drmUnsupported');
    expect(fetchFn.mock.calls.every(([url]) => url.endsWith('.m3u8'))).toBe(true);
  });

  it('keeps clear renditions downloadable beside a protected rendition', async () => {
    const masterUrl = 'https://pb3.rplay.live/example/master.m3u8';
    const fetchFn = vi.fn(async (url) => {
      if (url === masterUrl) return new Response('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nclear.m3u8\n'
        + '#EXT-X-STREAM-INF:BANDWIDTH=2\nprotected.m3u8');
      return new Response('#EXTM3U\n' + (url.endsWith('protected.m3u8')
        ? '#EXT-X-KEY:METHOD=SAMPLE-AES,URI="key"\n' : '#EXT-X-KEY:METHOD=AES-128,URI="key"\n')
        + '#EXTINF:5,\na.ts\n#EXT-X-ENDLIST');
    });
    const detected = await inspectVideoSource(masterUrl, { fetchFn });
    expect(detected.streams.map((stream) => stream.unavailableReason)).toEqual([null, 'drmUnsupported']);
  });

  it('replaces track-only notices with the actual manifest and deduplicates child requests', async () => {
    const cmaf = await inspectVideoSource('https://pb3.rplay.live/example/video.cmfv', { fetchFn: vi.fn() });
    const master = {
      baseUrl: 'https://pb3.rplay.live/example/master.m3u8', sourceType: 'hls',
      relatedUrls: [cmaf.baseUrl, 'https://pb3.rplay.live/example/video.m3u8'],
    };
    expect(isKnownVideoSource([cmaf], master.baseUrl)).toBe(false);
    expect(isKnownVideoSource([cmaf], 'https://pb3.rplay.live/example/video2.cmfv')).toBe(false);
    const merged = mergeVideoSources([cmaf], master);
    expect(merged).toEqual([master]);
    expect(isKnownVideoSource(merged, cmaf.baseUrl)).toBe(true);
    expect(isKnownVideoSource(merged, master.relatedUrls[1])).toBe(true);
    expect(mergeVideoSources(merged, cmaf)).toBe(merged);
    expect(mergeVideoSources(merged, master)).toBe(merged);
    expect(mergeVideoSources([cmaf], { ...master, relatedUrls: [] })).toEqual([cmaf, { ...master, relatedUrls: [] }]);
  });

  it('associates CMAF with its DASH manifest in either request order without requiring HLS', async () => {
    const fetchFn = vi.fn(async () => new Response('<MPD mediaPresentationDuration="PT35M20S">'
      + '<Period><AdaptationSet><ContentProtection schemeIdUri="urn:mpeg:dash:mp4protection:2011" value="cbcs"/>'
      + '<Representation><BaseURL>video.cmfv</BaseURL><SegmentBase indexRange="100-200"/></Representation>'
      + '</AdaptationSet></Period></MPD>'));
    const dash = await inspectVideoSource('https://pb3.rplay.live/example/manifest.mpd', { fetchFn });
    const cmaf = await inspectVideoSource('https://pb3.rplay.live/example/video.cmfv', { fetchFn });
    expect(dash).toMatchObject({ unavailableReason: null, hasContentProtection: true, duration: 2120 });
    expect(mergeVideoSources([cmaf], dash)).toEqual([dash]);
    expect(mergeVideoSources([dash], cmaf)).toEqual([dash]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('keeps unrelated CMAF notices when a DASH read fails instead of guessing by directory', async () => {
    const fetchFn = vi.fn(async () => new Response('Forbidden', { status: 403 }));
    const dash = await inspectVideoSource('https://pb3.rplay.live/example/manifest.mpd', { fetchFn });
    const cmaf = await inspectVideoSource('https://pb3.rplay.live/example/other.cmfv', { fetchFn });
    expect(dash.hasContentProtection).toBeNull();
    expect(dash.unavailableReason).toBe('dashUnsupported');
    expect(mergeVideoSources([cmaf], dash)).toHaveLength(2);
  });

  it('recognizes numbered DASH segments without media reads or duplicated stored indexes', async () => {
    const base = 'https://pb3.rplay.live/example/';
    const fetchFn = vi.fn(async () => new Response('<MPD type="static"><Period start="PT0S">'
      + '<AdaptationSet mimeType="video/mp4"><SegmentTemplate timescale="90000"/>'
      + '<Representation id="1" width="1920" height="1080"><SegmentTemplate '
      + 'media="drm_sample_aes_V_2_$Number%09d$.cmfv" initialization="drm_sample_aes_V_2init.cmfv">'
      + '<SegmentTimeline><S t="0" d="540000" r="383"/><S t="207360000" d="24000"/>'
      + '</SegmentTimeline></SegmentTemplate></Representation></AdaptationSet></Period></MPD>'));
    const first = cmafObservation(`${base}drm_sample_aes_V_2_000000001.cmfv`);
    const last = cmafObservation(`${base}drm_sample_aes_V_2_000000385.cmfv`);
    const dash = await inspectVideoSource(`${base}manifest.mpd`, { fetchFn });
    expect(dash).toMatchObject({ sourceType: 'dash', unavailableReason: null });
    expect(dash.streams[0]).toMatchObject({ url: `${base}manifest.mpd#representation=1`, unavailableReason: null });
    expect(dash.streams[0]).not.toHaveProperty('videoSegments');
    expect(dash.streams[0]).not.toHaveProperty('audioSegments');
    expect(dash.relatedUrls).toContain(first.baseUrl);
    expect(dash.relatedUrls).toContain(last.baseUrl);
    expect(mergeVideoSources(mergeVideoSources([first], last), dash)).toEqual([dash]);
    expect(mergeVideoSources([dash], last)).toEqual([dash]);
    expect(fetchFn.mock.calls).toEqual([[`${base}manifest.mpd`, expect.any(Object)]]);
  });

  it('coalesces unique playback segment requests into one stable page observation', () => {
    const urls = Array.from({ length: 100 }, (_, index) => (
      `https://pb3.rplay.live/example/segment-${index}.cmfv?signature=${index}`
    ));
    let videos = [];
    for (const [index, url] of urls.entries()) {
      videos = mergeVideoSources(videos, cmafObservation(url, index + 1));
    }
    expect(videos).toHaveLength(1);
    expect(videos[0]).toMatchObject({
      baseUrl: urls[0], timestamp: 1, title: 'Page video', streams: [],
      unavailableReason: 'cmafNeedsPlaylist', observedUrls: urls, relatedUrls: urls,
    });
    for (const url of urls) expect(isKnownVideoSource(videos, url)).toBe(true);
    expect(mergeVideoSources(videos, cmafObservation(urls[99], 200))).toBe(videos);
  });

  it('retains signed query variations exactly rather than guessing media ownership', () => {
    const first = 'https://pb3.rplay.live/example/video.cmfv?content=one&signature=first';
    const second = 'https://pb3.rplay.live/example/video.cmfv?content=two&signature=second';
    const pending = mergeVideoSources([cmafObservation(first)], cmafObservation(second));
    const manifest = { baseUrl: 'https://pb3.rplay.live/example/one.mpd', sourceType: 'dash',
      relatedUrls: [first], streams: [{ url: first }] };
    const merged = mergeVideoSources(pending, manifest);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ baseUrl: second, observedUrls: [second], streams: [] });
    expect(merged[1]).toBe(manifest);
    expect(manifest.relatedUrls).not.toContain(second);
  });

  it('coalesces legacy stored notices without disturbing complete sources or their order', () => {
    const first = cmafObservation('https://pb3.rplay.live/one/segment.cmfv');
    const second = cmafObservation('https://media.rplay-cdn.com/two/segment.cmfv', 2);
    const manifest = { sourceType: 'hls', baseUrl: 'https://pb3.rplay.live/master.m3u8', streams: [] };
    const grouped = coalesceCmafObservations([first, manifest, second]);
    expect(grouped).toHaveLength(2);
    expect(grouped[0]).toMatchObject({ baseUrl: first.baseUrl, timestamp: 1,
      observedUrls: [first.baseUrl, second.baseUrl] });
    expect(grouped[1]).toBe(manifest);
    expect(coalesceCmafObservations(grouped)).toBe(grouped);
  });

  it('removes exact manifest-owned URLs while restoring legacy observations', () => {
    const first = cmafObservation('https://pb3.rplay.live/example/owned.cmfv');
    const second = cmafObservation('https://pb3.rplay.live/example/unknown.cmfv', 2);
    const manifest = { sourceType: 'dash', baseUrl: 'https://pb3.rplay.live/example/manifest.mpd',
      relatedUrls: [first.baseUrl], streams: [{ url: first.baseUrl }] };
    const result = coalesceCmafObservations([first, manifest, second]);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(manifest);
    expect(result[1]).toMatchObject({ baseUrl: second.baseUrl, observedUrls: [second.baseUrl] });
    expect(coalesceCmafObservations([first, manifest])).toEqual([manifest]);
    const grouped = mergeVideoSources([first], second);
    expect(coalesceCmafObservations([...grouped, manifest])[0])
      .toMatchObject({ baseUrl: second.baseUrl, observedUrls: [second.baseUrl] });
  });

  it('preserves observations after storage cloning and subsequent segment requests', () => {
    const first = cmafObservation('https://pb3.rplay.live/example/first.cmfv');
    const second = cmafObservation('https://pb3.rplay.live/example/second.cmfv');
    const third = cmafObservation('https://pb3.rplay.live/example/third.cmfv');
    const stored = structuredClone(mergeVideoSources([first], second));
    const result = mergeVideoSources(stored, third);
    expect(result).toHaveLength(1);
    expect(result[0].observedUrls).toEqual([first.baseUrl, second.baseUrl, third.baseUrl]);
  });

  it('retains unknown grouped observations even when their representative URL is already known', () => {
    const first = cmafObservation('https://pb3.rplay.live/example/known.cmfv');
    const second = cmafObservation('https://pb3.rplay.live/example/unknown.cmfv');
    const grouped = mergeVideoSources([first], second)[0];
    const manifest = { sourceType: 'dash', baseUrl: 'https://pb3.rplay.live/example/manifest.mpd',
      relatedUrls: [first.baseUrl], streams: [{ url: first.baseUrl }] };
    const result = mergeVideoSources([manifest], grouped);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(manifest);
    expect(result[1]).toMatchObject({ baseUrl: second.baseUrl, observedUrls: [second.baseUrl] });
    expect(mergeVideoSources([first], grouped)[0].observedUrls).toEqual([first.baseUrl, second.baseUrl]);
  });

  it.each(['first', 'last'])('removes only explicitly matched observed tracks (%s match)', (match) => {
    const urls = ['https://pb3.rplay.live/example/first.cmfv', 'https://pb3.rplay.live/example/last.cmfv'];
    const matched = match === 'first' ? urls[0] : urls[1];
    const remaining = urls.find((url) => url !== matched);
    const pending = mergeVideoSources([cmafObservation(urls[0])], cmafObservation(urls[1]));
    const manifest = { sourceType: 'hls', baseUrl: 'https://pb3.rplay.live/example/master.m3u8',
      relatedUrls: [matched], streams: [{ url: matched }] };
    const result = mergeVideoSources(pending, manifest);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ baseUrl: remaining, observedUrls: [remaining], relatedUrls: [remaining] });
    expect(result[1]).toBe(manifest);
    const lastManifest = { ...manifest, baseUrl: 'https://pb3.rplay.live/example/last.mpd', sourceType: 'dash',
      relatedUrls: [remaining], streams: [{ url: remaining }] };
    expect(mergeVideoSources(result, lastManifest)).toEqual([manifest, lastManifest]);
  });

  it('keeps manifests authoritative when they arrive before unknown playback segments', () => {
    const known = 'https://pb3.rplay.live/example/known.cmfv';
    const manifest = { sourceType: 'dash', baseUrl: 'https://pb3.rplay.live/example/manifest.mpd',
      relatedUrls: [known], streams: [{ url: known }] };
    const videos = [manifest];
    expect(mergeVideoSources(videos, cmafObservation(known))).toBe(videos);
    const first = 'https://pb3.rplay.live/example/unknown-1.cmfv';
    const second = 'https://pb3.rplay.live/example/unknown-2.cmfv';
    const grouped = mergeVideoSources(mergeVideoSources(videos, cmafObservation(first)), cmafObservation(second));
    expect(grouped).toHaveLength(2);
    expect(grouped[0]).toBe(manifest);
    expect(grouped[1]).toMatchObject({ observedUrls: [first, second], streams: [] });
  });

  it('does not coalesce downloadable CMAF sources or explicit unsupported manifests', () => {
    const pending = cmafObservation('https://pb3.rplay.live/example/segment.cmfv');
    const playable = { ...pending, baseUrl: 'https://pb3.rplay.live/example/full.cmfv',
      relatedUrls: ['https://pb3.rplay.live/example/full.cmfv'],
      unavailableReason: null, streams: [{ url: 'https://pb3.rplay.live/example/full.cmfv' }] };
    const unsupported = { ...pending, sourceType: 'dash', unavailableReason: 'dashUnsupported',
      relatedUrls: ['https://pb3.rplay.live/example/manifest.mpd'],
      baseUrl: 'https://pb3.rplay.live/example/manifest.mpd' };
    expect(isCmafTrackOnlySource(pending)).toBe(true);
    expect(isCmafTrackOnlySource(playable)).toBe(false);
    expect(isCmafTrackOnlySource(unsupported)).toBe(false);
    const videos = [pending, playable, unsupported];
    expect(coalesceCmafObservations(videos)).toBe(videos);
  });
});
