import { describe, expect, it, vi } from 'vitest';
import { inspectVideoSource, isRPlayMasterUrl } from '../src/video-detector.js';

describe('RPlay video detector', () => {
  it('recognizes supported master endpoints', () => {
    expect(isRPlayMasterUrl(
      'https://api2.rplay.live/content/hlsstream?s3key=media/example/master.m3u8',
    )).toBe(true);
    expect(isRPlayMasterUrl('https://example.test/master.m3u8')).toBe(false);
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
});
