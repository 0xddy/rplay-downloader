import { describe, expect, it } from 'vitest';
import { ADTS, HLS, HLS_FORMATS, MP3, MP4, MPEG_TS } from 'mediabunny';
import {
  decryptAes128,
  generateSequenceIv,
  getPrefetchableSegmentUrls,
  looksLikeTransportStream,
  parseAttributeList,
  parseIv,
  parseMasterPlaylist,
  parseMediaPlaylist,
  processInOrderedBatches,
  resolveOutputRotation,
} from '../src/hls.js';

describe('HLS master playlist', () => {
  it('registers both HLS playlists and their common media segment formats', () => {
    expect(HLS_FORMATS).toEqual(expect.arrayContaining([HLS, MPEG_TS, MP4, ADTS, MP3]));
  });

  it('parses quoted attributes and external audio pairing', () => {
    const content = `#EXTM3U
#EXT-X-SESSION-KEY:METHOD=AES-128,URI="session.key"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio-main",NAME="Chinese, Stereo",DEFAULT=YES,URI="audio/index.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=4100000,AVERAGE-BANDWIDTH=3500000,RESOLUTION=1920x1080,CODECS="avc1.640028,mp4a.40.2",AUDIO="audio-main"
video/1080p.m3u8`;
    const result = parseMasterPlaylist(content, 'https://cdn.example/master.m3u8');
    expect(result.streams).toHaveLength(1);
    expect(result.streams[0]).toMatchObject({
      url: 'https://cdn.example/video/1080p.m3u8',
      width: 1920,
      height: 1080,
      bandwidth: 4_100_000,
      hasExternalAudio: true,
      audioUrl: 'https://cdn.example/audio/index.m3u8',
    });
    expect(result.audioGroups.get('audio-main')[0].name).toBe('Chinese, Stereo');
    expect(result.sessionKeys[0]).toMatchObject({
      method: 'AES-128',
      uri: 'https://cdn.example/session.key',
      keyFormat: 'identity',
    });
  });

  it('keeps commas inside quoted attribute values', () => {
    expect(parseAttributeList('CODECS="avc1.4d401f,mp4a.40.2",BANDWIDTH=1')).toEqual({
      CODECS: 'avc1.4d401f,mp4a.40.2',
      BANDWIDTH: '1',
    });
  });

  it('extracts only bounded-prefetch-safe VOD segments', () => {
    const playlist = `#EXTM3U
#EXTINF:4,
000.ts
#EXT-X-DISCONTINUITY
#EXTINF:4,
001.ts
#EXT-X-ENDLIST`;
    expect(getPrefetchableSegmentUrls(playlist, 'https://cdn.example/v/index.m3u8')).toEqual([
      'https://cdn.example/v/000.ts',
      'https://cdn.example/v/001.ts',
    ]);
    expect(getPrefetchableSegmentUrls(
      '#EXTM3U\n#EXT-X-BYTERANGE:100@0\n#EXTINF:4,\nvideo.ts\n#EXT-X-ENDLIST',
      'https://cdn.example/v/index.m3u8',
    )).toEqual([]);
    expect(getPrefetchableSegmentUrls(
      '#EXTM3U\n#EXTINF:4,\nlive.ts',
      'https://cdn.example/v/index.m3u8',
    )).toEqual([]);
  });
});

describe('MP4 display rotation', () => {
  it('removes a conflicting quarter-turn from an already-landscape track', () => {
    expect(resolveOutputRotation(1920, 1080, 1920, 1080, 90)).toBe(0);
    expect(resolveOutputRotation(1920, 1080, 1920, 1080, 270)).toBe(0);
  });

  it('keeps rotation when coded portrait frames need it to match the requested landscape display', () => {
    expect(resolveOutputRotation(1920, 1080, 1080, 1920, 90)).toBe(90);
    expect(resolveOutputRotation(1080, 1920, 1920, 1080, 90)).toBe(90);
    expect(resolveOutputRotation(1920, 1080, 1920, 1080, 180)).toBe(180);
  });
});

describe('TS fallback playlist', () => {
  it('tracks AES-128 key rotation, METHOD=NONE and sequence IVs per segment', () => {
    const content = `#EXTM3U
#EXT-X-MEDIA-SEQUENCE:4294967297
#EXT-X-KEY:METHOD=AES-128,URI="key-a",IV=0x01
#EXTINF:4,
000.ts
#EXT-X-KEY:METHOD=AES-128,URI="key-b"
#EXTINF:4,
001.ts
#EXT-X-KEY:METHOD=NONE
#EXTINF:4,
002.ts
#EXT-X-ENDLIST`;
    const result = parseMediaPlaylist(content, 'https://cdn.example/v/index.m3u8');
    expect(result.segments.map((segment) => segment.sequence)).toEqual([
      4_294_967_297,
      4_294_967_298,
      4_294_967_299,
    ]);
    expect(result.segments[0].key).toMatchObject({ uri: 'https://cdn.example/v/key-a', iv: '0x01' });
    expect(result.segments[1].key).toMatchObject({ uri: 'https://cdn.example/v/key-b', iv: null });
    expect(result.segments[2].key).toBeNull();
  });

  it('uses a master session key only when the media playlist has no key tags', () => {
    const sessionKey = { method: 'AES-128', uri: 'https://cdn.example/session.key', iv: null };
    const inherited = parseMediaPlaylist(
      '#EXTM3U\n#EXTINF:4,\n000.ts\n#EXT-X-ENDLIST',
      'https://cdn.example/v/index.m3u8',
      sessionKey,
    );
    expect(inherited.segments[0].key).toEqual(sessionKey);

    const explicitNone = parseMediaPlaylist(
      '#EXTM3U\n#EXT-X-KEY:METHOD=NONE\n#EXTINF:4,\n000.ts\n#EXT-X-ENDLIST',
      'https://cdn.example/v/index.m3u8',
      sessionKey,
    );
    expect(explicitNone.segments[0].key).toBeNull();
  });

  it('rejects fMP4, SAMPLE-AES, byte ranges, and live playlists', () => {
    expect(() => parseMediaPlaylist('#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:1,\na.m4s\n#EXT-X-ENDLIST', 'https://x/p.m3u8'))
      .toThrow(/fMP4\/CMAF/);
    expect(() => parseMediaPlaylist('#EXTM3U\n#EXT-X-KEY:METHOD=SAMPLE-AES,URI="k"\n#EXTINF:1,\na.ts\n#EXT-X-ENDLIST', 'https://x/p.m3u8'))
      .toThrow(/SAMPLE-AES/);
    expect(() => parseMediaPlaylist('#EXTM3U\n#EXT-X-BYTERANGE:10@0\n#EXTINF:1,\na.ts\n#EXT-X-ENDLIST', 'https://x/p.m3u8'))
      .toThrow(/BYTERANGE/);
    expect(() => parseMediaPlaylist('#EXTM3U\n#EXTINF:1,\na.ts', 'https://x/p.m3u8'))
      .toThrow(/VOD/);
  });

  it('creates 128-bit big-endian explicit and implicit IVs', () => {
    expect([...parseIv('0x01')]).toEqual([...new Uint8Array(15), 1]);
    expect([...generateSequenceIv(4_294_967_297)]).toEqual([
      ...new Uint8Array(11), 1, 0, 0, 0, 1,
    ]);
  });

  it('recognizes transport stream sync bytes', () => {
    const ts = new Uint8Array(188 * 2);
    ts[0] = 0x47;
    ts[188] = 0x47;
    expect(looksLikeTransportStream(ts)).toBe(true);
    expect(looksLikeTransportStream(new Uint8Array([1, 2, 3]))).toBe(false);
  });

  it('decrypts an AES-128 encrypted TS segment without changing its payload', async () => {
    const rawKey = Uint8Array.from({ length: 16 }, (_, index) => index + 1);
    const iv = generateSequenceIv(42);
    const plaintext = new Uint8Array(188 * 2);
    plaintext[0] = 0x47;
    plaintext[188] = 0x47;
    for (let index = 1; index < plaintext.length; index++) {
      if (index !== 188) plaintext[index] = index % 251;
    }
    const encryptionKey = await crypto.subtle.importKey('raw', rawKey, { name: 'AES-CBC' }, false, ['encrypt']);
    const decryptionKey = await crypto.subtle.importKey('raw', rawKey, { name: 'AES-CBC' }, false, ['decrypt']);
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, encryptionKey, plaintext);
    const decrypted = new Uint8Array(await decryptAes128(encrypted, decryptionKey, iv));
    expect(decrypted).toEqual(plaintext);
    expect(looksLikeTransportStream(decrypted)).toBe(true);
  });

  it('downloads concurrently but always writes in source order with bounded batches', async () => {
    const writes = [];
    let active = 0;
    let maximumActive = 0;
    await processInOrderedBatches(
      [0, 1, 2, 3, 4, 5, 6],
      3,
      async (value) => {
        active++;
        maximumActive = Math.max(maximumActive, active);
        await new Promise((resolve) => setTimeout(resolve, (3 - (value % 3)) * 2));
        active--;
        return value;
      },
      async (value) => writes.push(value),
    );
    expect(writes).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(maximumActive).toBeLessThanOrEqual(3);
  });
});
