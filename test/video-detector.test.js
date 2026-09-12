import { describe, expect, it, vi } from 'vitest';
import {
  getRPlaySourceType,
  inspectVideoSource,
  isKnownVideoSource,
  isRPlayMasterUrl,
  mergeVideoSources,
  shouldInspectMediaRequest,
} from '../src/video-detector.js';

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
});
