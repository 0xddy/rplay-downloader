import { describe, expect, it } from 'vitest';
import { makeDownloadFilename, normalizeVideoTitle, sanitizeFilename } from '../src/naming.js';

describe('download filename', () => {
  it('uses the video title without the RPLAY tab suffix', () => {
    const title = normalizeVideoTitle('  视频 标题 | RPLAY  ');
    expect(title).toBe('视频 标题');
    expect(makeDownloadFilename({
      title,
      resolution: '1920x1080',
      createdAt: Date.UTC(2026, 0, 2, 3, 4, 5),
    }, 'mp4')).toMatch(/^视频 标题_1920x1080_2026-01-02T03-04-05/);
  });

  it('keeps unicode and replaces only characters illegal in Windows filenames', () => {
    expect(normalizeVideoTitle('标题💋:测试?')).toBe('标题💋:测试?');
    expect(sanitizeFilename('标题💋:测试?')).toBe('标题💋_测试_');
  });
});
