import { describe, expect, it } from 'vitest';
import { HlsSegmentPrefetcher } from '../src/hls-prefetch.js';

describe('HLS segment prefetcher', () => {
  it('keeps five segment requests active and serves byte ranges from the prefetched result', async () => {
    const playlistUrl = 'https://cdn.example/video/index.m3u8';
    const playlist = [
      '#EXTM3U',
      ...Array.from({ length: 8 }, (_, index) => `#EXTINF:4,\n${index}.ts`),
      '#EXT-X-ENDLIST',
    ].join('\n');
    let active = 0;
    let maximumActive = 0;
    const fetchFn = async (input) => {
      const url = String(input);
      active++;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, url.endsWith('.m3u8') ? 1 : 10));
      active--;
      const body = url.endsWith('.m3u8')
        ? new TextEncoder().encode(playlist)
        : Uint8Array.from([0x47, 1, 2, 3]);
      return new Response(body, { headers: { 'Content-Type': 'video/mp2t' } });
    };

    const prefetcher = new HlsSegmentPrefetcher(fetchFn, { concurrency: 5, windowSize: 6 });
    await prefetcher.prepare([playlistUrl]);
    const response = await prefetcher.fetch('https://cdn.example/video/0.ts', {
      headers: { Range: 'bytes=1-2' },
    });

    expect(maximumActive).toBe(5);
    expect(response.status).toBe(206);
    expect(response.headers.get('Content-Range')).toBe('bytes 1-2/4');
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1, 2]);
    prefetcher.dispose();
  });

  it('serves a cached master playlist as a range response even without an m3u8 suffix', async () => {
    const masterUrl = 'https://api2.rplay.live/content/hlsstream?s3key=video';
    const master = [
      '#EXTM3U',
      '#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=1280x720',
      'video.m3u8',
    ].join('\n');
    let requests = 0;
    const fetchFn = async () => {
      requests++;
      return new Response(new TextEncoder().encode(master), {
        headers: { 'Content-Type': 'application/vnd.apple.mpegurl' },
      });
    };

    const prefetcher = new HlsSegmentPrefetcher(fetchFn);
    await prefetcher.prepare([masterUrl]);
    const response = await prefetcher.fetch(masterUrl, {
      headers: { Range: 'bytes=0-' },
    });

    expect(requests).toBe(1);
    expect(response.status).toBe(206);
    expect(response.headers.get('Content-Range')).toBe(`bytes 0-${master.length - 1}/${master.length}`);
    expect(await response.text()).toBe(master);
    prefetcher.dispose();
  });

  it('pauses speculative prefetching when the byte budget is full', async () => {
    const playlistUrl = 'https://cdn.example/video/index.m3u8';
    const playlist = [
      '#EXTM3U',
      ...Array.from({ length: 5 }, (_, index) => `#EXTINF:4,\n${index}.ts`),
      '#EXT-X-ENDLIST',
    ].join('\n');
    let segmentRequests = 0;
    const fetchFn = async (input) => {
      const url = String(input);
      if (url.endsWith('.m3u8')) return new Response(playlist);
      segmentRequests++;
      return new Response(new Uint8Array(8));
    };

    const prefetcher = new HlsSegmentPrefetcher(fetchFn, {
      concurrency: 1,
      windowSize: 5,
      maxBufferedBytes: 8,
    });
    await prefetcher.prepare([playlistUrl]);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(segmentRequests).toBe(1);
    expect(prefetcher.bufferedBytes).toBe(8);

    await prefetcher.fetch('https://cdn.example/video/0.ts');
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(segmentRequests).toBe(2);
    expect(prefetcher.bufferedBytes).toBe(8);
    prefetcher.dispose();
  });
});
