import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BufferSource, EncodedPacketSink, Input, MP4 } from 'mediabunny';
import { parseDashMetadata } from '../src/dash-metadata.js';
import { remuxToMp4 } from '../src/mp4-remux.js';
import { abortDownloadContext } from '../src/download-session.js';
import { createCdmKeyResolver } from '../src/cdm-client.js';
import { BrowserCdm, importWvd } from '../src/cdm-browser.js';
import { syntheticLicense, syntheticWvd } from './helpers/cdm-fixtures.js';
import { createMemoryOpfs } from './helpers/memory-opfs.js';
import { segmentedDashFixture, withAudioPrimingEdit } from './helpers/dash-segments-fixture.js';

const base = 'https://pb3.rplay.live/test/';
const manifestUrl = `${base}manifest.mpd`;
const fixture = (name) => readFile(new URL(`./fixtures/${name}`, import.meta.url));
const manifest = (await fixture('dash-manifest.mpd')).toString();
const videoBytes = await fixture('dash-video.cmfv');
const audioBytes = await fixture('dash-audio.cmfa');

function responseFor(bytes, init = {}) {
  const range = /^bytes=(\d+)-(\d*)$/.exec(new Headers(init.headers).get('Range') || '');
  const start = range ? Number(range[1]) : 0;
  const end = range?.[2] ? Math.min(Number(range[2]), bytes.length - 1) : bytes.length - 1;
  const headers = { 'Accept-Ranges': 'bytes', 'Content-Length': String(end - start + 1) };
  if (range) headers['Content-Range'] = `bytes ${start}-${end}/${bytes.length}`;
  return new Response(bytes.subarray(start, end + 1), { status: range ? 206 : 200, headers });
}

async function packets(track) {
  const result = [];
  for await (const packet of new EncodedPacketSink(track).packets()) result.push(packet);
  return result;
}

describe('DASH download and MP4 remux', () => {
  let storage;
  let task;
  let context;
  let reporter;
  let fetchFn;

  beforeEach(() => {
    storage = createMemoryOpfs();
    vi.stubGlobal('navigator', storage.navigator);
    const metadata = parseDashMetadata(manifest, manifestUrl);
    const [stream] = metadata.streams;
    task = { taskId: 'dash-test', sourceType: 'dash', title: 'Test pattern', masterUrl: manifestUrl,
      streamUrl: stream.url, ...stream, duration: metadata.duration };
    context = { controller: new AbortController(), input: null, audioInput: null, output: null, prefetcher: null };
    reporter = { addBytes: vi.fn(), notePacket: vi.fn(), setPhase: vi.fn() };
    fetchFn = vi.fn(async (input, init) => {
      const url = String(input);
      if (url === manifestUrl) return new Response(manifest);
      if (url === `${base}dash-video.cmfv`) return responseFor(videoBytes, init);
      if (url === `${base}dash-audio.cmfa`) return responseFor(audioBytes, init);
      throw new Error(`Unexpected test URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchFn);
  });

  afterEach(() => vi.unstubAllGlobals());

  function useSegmentedFixture(video = videoBytes, audio = audioBytes, scheme = null) {
    const segmented = segmentedDashFixture(video, audio, base, scheme);
    const metadata = parseDashMetadata(segmented.manifest, manifestUrl);
    const [stream] = metadata.streams;
    Object.assign(task, { ...stream, streamUrl: stream.url, duration: metadata.duration });
    fetchFn.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === manifestUrl) return new Response(segmented.manifest);
      const bytes = segmented.resources.get(url);
      if (!bytes) throw new Error(`Unexpected segmented DASH network URL: ${url}`);
      return responseFor(bytes, init);
    });
    return segmented;
  }

  async function expectPreservedSegmentedPackets(temp, originalAudio = audioBytes) {
    const result = new Input({ formats: [MP4], source: new BufferSource(await (await temp.handle.getFile()).arrayBuffer()) });
    const originalVideoInput = new Input({ formats: [MP4], source: new BufferSource(videoBytes) });
    const originalAudioInput = new Input({ formats: [MP4], source: new BufferSource(originalAudio) });
    try {
      const expectedVideo = await packets(await originalVideoInput.getPrimaryVideoTrack());
      const expectedAudio = await packets(await originalAudioInput.getPrimaryAudioTrack());
      const baseTimestamp = Math.min(expectedVideo[0].timestamp, expectedAudio[0].timestamp);
      let largestTimestampDifference = 0;
      for (const [expected, getTrack] of [[expectedVideo, 'getPrimaryVideoTrack'], [expectedAudio, 'getPrimaryAudioTrack']]) {
        const actual = await packets(await result[getTrack]());
        expect(actual.map((packet) => packet.data)).toEqual(expected.map((packet) => packet.data));
        expect(actual).toHaveLength(expected.length);
        for (let index = 0; index < actual.length; index++) {
          const difference = Math.abs(actual[index].timestamp - (expected[index].timestamp - baseTimestamp));
          largestTimestampDifference = Math.max(largestTimestampDifference, difference);
          expect(difference).toBeLessThan(1 / 48000);
          expect(actual[index].duration).toBeCloseTo(expected[index].duration, 5);
        }
      }
      return largestTimestampDifference;
    } finally {
      result.dispose(); originalVideoInput.dispose(); originalAudioInput.dispose();
    }
  }

  it('downloads initialization plus padded-number DASH segments and preserves independent audio/video timelines', async () => {
    const segmented = useSegmentedFixture();
    expect(segmented.videoTrack.segments).toHaveLength(2);
    expect(segmented.audioTrack.segments).toHaveLength(1);
    expect(segmented.audioTrack.segments[0].ticks / segmented.audioTrack.timescale).not.toBe(1);
    const temp = await remuxToMp4(task, reporter, context);
    expect(await expectPreservedSegmentedPackets(temp)).toBeLessThan(1 / 48000);
    const requestedUrls = new Set(fetchFn.mock.calls.map(([url]) => String(url)));
    for (const url of segmented.resources.keys()) expect(requestedUrls.has(url)).toBe(true);
    expect([...requestedUrls].every((url) => url === manifestUrl || segmented.resources.has(url))).toBe(true);
    expect(context.input).toBeNull();
    expect(context.audioInput).toBeNull();
    expect(context.prefetcher).toBeNull();
  });

  it.each(['cenc', 'cbcs'])('decrypts separated %s initialization/media segments through the license flow', async (scheme) => {
    const segmented = useSegmentedFixture(await fixture(`${scheme}-video.mp4`), await fixture(`${scheme}-audio.mp4`), scheme);
    task.licenseUrl = 'https://widevine-dash.ezdrm.com/widevine-php/widevine-foreignkey.php?token=synthetic-segments';
    const licenseFetch = vi.fn(async (_url, init) => new Response(syntheticLicense(init.body)));
    context.resolveMediaKey = createCdmKeyResolver(task, context, {
      fetchFn: licenseFetch, createCdm: async () => new BrowserCdm(await importWvd(syntheticWvd())),
    });
    try {
      const temp = await remuxToMp4(task, reporter, context);
      expect(await expectPreservedSegmentedPackets(temp)).toBeLessThan(1 / 48000);
      expect(licenseFetch.mock.calls.filter(([url]) => url === task.licenseUrl)).toHaveLength(2);
      const requestedUrls = new Set(fetchFn.mock.calls.map(([url]) => String(url)));
      for (const url of segmented.resources.keys()) expect(requestedUrls.has(url)).toBe(true);
      expect([...requestedUrls].every((url) => url === manifestUrl || segmented.resources.has(url))).toBe(true);
    } finally {
      context.resolveMediaKey.dispose();
    }
  });

  it('preserves an audio priming edit instead of independently zeroing segmented audio and video', async () => {
    const primedAudio = withAudioPrimingEdit(audioBytes);
    useSegmentedFixture(videoBytes, primedAudio);
    const temp = await remuxToMp4(task, reporter, context);
    expect(await expectPreservedSegmentedPackets(temp, primedAudio)).toBeLessThan(1 / 48000);
  });

  it.each(['audio', 'video'])('supports a complete %s track paired with a segmented other track', async (completeType) => {
    const segmented = useSegmentedFixture();
    const extension = completeType === 'video' ? 'cmfv' : 'cmfa';
    const attributes = completeType === 'video' ? 'width="160" height="90" codecs="avc1.42c00a"' : 'codecs="mp4a.40.2"';
    const mixedManifest = segmented.manifest.replace(new RegExp(`<AdaptationSet mimeType="${completeType}/mp4">.*?</AdaptationSet>`),
      `<AdaptationSet mimeType="${completeType}/mp4"><Representation id="${completeType === 'video' ? 'v1' : 'a1'}" ${attributes}>`
      + `<BaseURL>dash-${completeType}.${extension}</BaseURL><SegmentBase/></Representation></AdaptationSet>`);
    const [stream] = parseDashMetadata(mixedManifest, manifestUrl).streams;
    Object.assign(task, { ...stream, streamUrl: stream.url });
    const originalFetch = fetchFn.getMockImplementation();
    fetchFn.mockImplementation((url, init) => {
      if (String(url) === manifestUrl) return Promise.resolve(new Response(mixedManifest));
      if (String(url) === `${base}dash-${completeType}.${extension}`) {
        return Promise.resolve(responseFor(completeType === 'video' ? videoBytes : audioBytes, init));
      }
      return originalFetch(url, init);
    });
    const temp = await remuxToMp4(task, reporter, context);
    expect(await expectPreservedSegmentedPackets(temp)).toBeLessThan(1 / 48000);
    expect(fetchFn.mock.calls.some(([url]) => String(url) === `${base}dash-${completeType}.${extension}`)).toBe(true);
    expect(context.prefetcher).toBeNull();
  });

  it('rejects a changed audio representation even when it reuses the same complete-track URL', async () => {
    fetchFn.mockImplementationOnce(async () => new Response(manifest.replace('id="audio"', 'id="audio-new"')));
    await expect(remuxToMp4(task, reporter, context)).rejects.toMatchObject({ code: 'DASH_SELECTION_CHANGED' });
    expect(storage.files.size).toBe(0);
    expect(context.input).toBeNull();
    expect(context.audioInput).toBeNull();
    expect(context.prefetcher).toBeNull();
  });

  it('removes partial output when a selected DASH audio segment fails', async () => {
    useSegmentedFixture();
    const originalFetch = fetchFn.getMockImplementation();
    fetchFn.mockImplementation((url, init) => String(url).endsWith('audio_000000001.cmfa')
      ? Promise.resolve(new Response('Forbidden', { status: 403 })) : originalFetch(url, init));
    await expect(remuxToMp4(task, reporter, context)).rejects.toThrow(/HTTP 403/);
    expect(storage.files.size).toBe(0);
    expect(context.input).toBeNull();
    expect(context.audioInput).toBeNull();
    expect(context.prefetcher).toBeNull();
    expect(context.output).toBeNull();
  });

  it('cancels segmented media requests and clears both inputs, prefetching, and partial output', async () => {
    useSegmentedFixture();
    let started;
    let mediaSignal;
    const audioStarted = new Promise((resolve) => { started = resolve; });
    const originalFetch = fetchFn.getMockImplementation();
    fetchFn.mockImplementation((url, init) => {
      if (!String(url).endsWith('audio_000000001.cmfa')) return originalFetch(url, init);
      mediaSignal = init.signal;
      started();
      return new Promise((_resolve, reject) => init.signal.addEventListener('abort',
        () => reject(new DOMException('Canceled', 'AbortError')), { once: true }));
    });
    const pending = remuxToMp4(task, reporter, context);
    const rejected = expect(pending).rejects.toMatchObject({ code: 'TASK_CANCELED' });
    await audioStarted;
    abortDownloadContext(context);
    await rejected;
    expect(mediaSignal.aborted).toBe(true);
    expect(storage.files.size).toBe(0);
    expect(context.input).toBeNull();
    expect(context.audioInput).toBeNull();
    expect(context.prefetcher).toBeNull();
    expect(context.output).toBeNull();
  });

  it.each(['cenc', 'cbcs'])('decrypts %s audio/video using the license flow and preserves every encoded packet', async (scheme) => {
    const encryptedVideo = await fixture(`${scheme}-video.mp4`);
    const encryptedAudio = await fixture(`${scheme}-audio.mp4`);
    const licenseUrl = 'https://widevine-dash.ezdrm.com/widevine-php/widevine-foreignkey.php?token=synthetic';
    task.licenseUrl = licenseUrl;
    const licenseFetch = vi.fn(async (_url, init) => new Response(syntheticLicense(init.body)));
    context.resolveMediaKey = createCdmKeyResolver(task, context, {
      fetchFn: licenseFetch, createCdm: async () => new BrowserCdm(await importWvd(syntheticWvd())),
    });
    fetchFn.mockImplementation(async (url, init) => {
      if (url === manifestUrl) return new Response(manifest.replace('<Period start="PT0S">',
        `<Period start="PT0S"><ContentProtection schemeIdUri="urn:mpeg:dash:mp4protection:2011" value="${scheme}"/>`));
      return responseFor(String(url).endsWith('.cmfv') ? encryptedVideo : encryptedAudio, init);
    });
    const temp = await remuxToMp4(task, reporter, context);
    const result = new Input({ formats: [MP4], source: new BufferSource(await (await temp.handle.getFile()).arrayBuffer()) });
    const videoInput = new Input({ formats: [MP4], source: new BufferSource(videoBytes) });
    const audioInput = new Input({ formats: [MP4], source: new BufferSource(audioBytes) });
    try {
      for (const [original, getTrack] of [[videoInput, 'getPrimaryVideoTrack'], [audioInput, 'getPrimaryAudioTrack']]) {
        const actualPackets = await packets(await result[getTrack]());
        const expectedPackets = await packets(await original[getTrack]());
        expect(actualPackets.map((packet) => packet.data)).toEqual(expectedPackets.map((packet) => packet.data));
      }
      // Distinct audio/video PSSH values can authorize concurrently.
      expect(licenseFetch.mock.calls.filter(([url]) => url === licenseUrl)).toHaveLength(2);
      expect(context.input).toBeNull();
      expect(context.audioInput).toBeNull();
    } finally {
      result.dispose(); videoInput.dispose(); audioInput.dispose(); context.resolveMediaKey.dispose();
    }
  });

  it('saves a real MP4 containing every video and audio packet without transcoding', async () => {
    const temp = await remuxToMp4(task, reporter, context);
    const file = await temp.handle.getFile();
    const result = new Input({ formats: [MP4], source: new BufferSource(await file.arrayBuffer()) });
    const videoInput = new Input({ formats: [MP4], source: new BufferSource(videoBytes) });
    const audioInput = new Input({ formats: [MP4], source: new BufferSource(audioBytes) });
    try {
      const [videoTrack] = await result.getVideoTracks();
      const [audioTrack] = await result.getAudioTracks();
      expect(await videoTrack.getCodec()).toBe('avc');
      expect(await audioTrack.getCodec()).toBe('aac');
      expect(await videoTrack.getCodedWidth()).toBe(160);
      expect(await videoTrack.getCodedHeight()).toBe(90);
      expect(await result.computeDuration()).toBeCloseTo(2.022, 1);
      const outputVideo = await packets(videoTrack);
      const outputAudio = await packets(audioTrack);
      const originalVideo = await packets((await videoInput.getVideoTracks())[0]);
      const originalAudio = await packets((await audioInput.getAudioTracks())[0]);
      expect(outputVideo).toHaveLength(20);
      expect(outputVideo.map((packet) => packet.data)).toEqual(originalVideo.map((packet) => packet.data));
      expect(outputAudio.map((packet) => packet.data)).toEqual(originalAudio.map((packet) => packet.data));
      expect(outputVideo[0].timestamp).toBeCloseTo(outputAudio[0].timestamp, 2);
      expect(reporter.addBytes).toHaveBeenCalled();
      expect(reporter.notePacket).toHaveBeenCalled();
      expect(context.input).toBeNull();
      expect(context.audioInput).toBeNull();
      expect(fetchFn.mock.calls.some(([url]) => String(url).endsWith('.m3u8'))).toBe(false);
    } finally {
      result.dispose(); videoInput.dispose(); audioInput.dispose();
    }
  });

  it('downloads when the manifest omits resolution and duration metadata', async () => {
    task.width = null; task.height = null; task.duration = null;
    fetchFn.mockImplementationOnce(async () => new Response(manifest.replace('mediaPresentationDuration="PT2.022S"', '')));
    const temp = await remuxToMp4(task, reporter, context);
    expect(temp.size).toBeGreaterThan(1000);
    expect(reporter.notePacket.mock.calls.at(-1)[1]).toBeNull();
  });

  it('preserves the existing HLS download path with the same CMAF audio and video fixtures', async () => {
    const playlist = (name, bytes) => {
      let offset = 0;
      while (bytes.toString('ascii', offset + 4, offset + 8) !== 'moof') offset += bytes.readUInt32BE(offset);
      return `#EXTM3U\n#EXT-X-VERSION:7\n#EXT-X-TARGETDURATION:3\n`
        + `#EXT-X-MAP:URI="${name}",BYTERANGE="${offset}@0"\n#EXTINF:2.022,\n`
        + `#EXT-X-BYTERANGE:${bytes.length - offset}@${offset}\n${name}\n#EXT-X-ENDLIST`;
    };
    const master = '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",DEFAULT=YES,NAME="Audio",URI="audio.m3u8"\n'
      + '#EXT-X-STREAM-INF:BANDWIDTH=224000,RESOLUTION=160x90,CODECS="avc1.42c00a,mp4a.40.2",AUDIO="a"\nvideo.m3u8';
    const originalFetch = fetchFn.getMockImplementation();
    fetchFn.mockImplementation((url, init) => {
      if (url === `${base}master.m3u8`) return Promise.resolve(new Response(master));
      if (url === `${base}video.m3u8`) return Promise.resolve(new Response(playlist('dash-video.cmfv', videoBytes)));
      if (url === `${base}audio.m3u8`) return Promise.resolve(new Response(playlist('dash-audio.cmfa', audioBytes)));
      return originalFetch(url, init);
    });
    Object.assign(task, { sourceType: 'hls', masterUrl: `${base}master.m3u8`,
      streamUrl: `${base}video.m3u8`, audioUrl: `${base}audio.m3u8`, sessionKeys: [] });
    const temp = await remuxToMp4(task, reporter, context);
    const result = new Input({ formats: [MP4], source: new BufferSource(await (await temp.handle.getFile()).arrayBuffer()) });
    try {
      expect(await result.getVideoTracks()).toHaveLength(1);
      expect(await result.getAudioTracks()).toHaveLength(1);
      expect(await result.computeDuration()).toBeCloseTo(2.022, 1);
    } finally {
      result.dispose();
    }
  });

  it('does not produce a silent file if the selected audio cannot be downloaded', async () => {
    const originalFetch = fetchFn.getMockImplementation();
    fetchFn.mockImplementation((url, init) => String(url).endsWith('.cmfa')
      ? Promise.resolve(new Response('Forbidden', { status: 403 })) : originalFetch(url, init));
    await expect(remuxToMp4(task, reporter, context)).rejects.toThrow(/HTTP 403/);
    expect(storage.files.size).toBe(0);
    expect(context.input).toBeNull();
    expect(context.audioInput).toBeNull();
  });

  it('allows actual media parsing when the manifest declares content protection', async () => {
    fetchFn.mockImplementationOnce(async () => new Response(manifest.replace('<Period start="PT0S">',
      '<Period start="PT0S"><ContentProtection schemeIdUri="urn:mpeg:dash:mp4protection:2011" value="cbcs"/>')));
    const temp = await remuxToMp4(task, reporter, context);
    expect(temp.size).toBeGreaterThan(1000);
  });

  it('cancels both inputs and removes the partial output while fetching audio', async () => {
    let started;
    const audioStarted = new Promise((resolve) => { started = resolve; });
    const originalFetch = fetchFn.getMockImplementation();
    fetchFn.mockImplementation((url, init) => {
      if (!String(url).endsWith('.cmfa')) return originalFetch(url, init);
      started();
      return new Promise((resolve, reject) => init.signal.addEventListener('abort',
        () => reject(new DOMException('Canceled', 'AbortError')), { once: true }));
    });
    const pending = remuxToMp4(task, reporter, context);
    const rejected = expect(pending).rejects.toMatchObject({ code: 'TASK_CANCELED' });
    await audioStarted;
    abortDownloadContext(context);
    await rejected;
    expect(storage.files.size).toBe(0);
    expect(context.input).toBeNull();
    expect(context.audioInput).toBeNull();
  });
});
