import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BufferSource, BufferTarget, EncodedAudioPacketSource, EncodedPacketSink,
  EncodedVideoPacketSource, Input, MP4, Mp4OutputFormat, Output,
} from 'mediabunny';
import { parseDashMetadata } from '../src/dash-metadata.js';
import { remuxToMp4 } from '../src/mp4-remux.js';
import { createMemoryOpfs } from './helpers/memory-opfs.js';

const base = 'https://pb3.rplay.live/muxed-test/';
const manifestUrl = `${base}manifest.mpd`;
const fixture = (name) => readFile(new URL(`./fixtures/${name}`, import.meta.url));
const videoBytes = await fixture('dash-video.cmfv');
const audioBytes = await fixture('dash-audio.cmfa');

function splitInitialization(bytes) {
  let offset = 0;
  while (bytes.toString('ascii', offset + 4, offset + 8) !== 'moof') offset += bytes.readUInt32BE(offset);
  return { initialization: bytes.subarray(0, offset), segment: bytes.subarray(offset) };
}

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

async function createMuxedFragment() {
  const videoInput = new Input({ formats: [MP4], source: new BufferSource(videoBytes) });
  const audioInput = new Input({ formats: [MP4], source: new BufferSource(audioBytes) });
  try {
    const videoTrack = await videoInput.getPrimaryVideoTrack();
    const audioTrack = await audioInput.getPrimaryAudioTrack();
    const target = new BufferTarget();
    const output = new Output({
      format: new Mp4OutputFormat({ fastStart: 'fragmented', minimumFragmentDuration: 10 }), target,
    });
    const videoSource = new EncodedVideoPacketSource(await videoTrack.getCodec());
    const audioSource = new EncodedAudioPacketSource(await audioTrack.getCodec());
    output.addVideoTrack(videoSource);
    output.addAudioTrack(audioSource);
    await output.start();
    await Promise.all([[videoTrack, videoSource], [audioTrack, audioSource]].map(async ([track, source]) => {
      const decoderConfig = await track.getDecoderConfig();
      // Real encoded fixtures, remuxed in memory without decoding/transcoding.
      // Nonzero first PTS exposes mismatched rebasing of embedded audio/video.
      for await (const packet of new EncodedPacketSink(track).packets()) {
        await source.add(packet.clone({ timestamp: packet.timestamp + 10 }), { decoderConfig });
      }
      source.close();
    }));
    await output.finalize();
    return Buffer.from(target.buffer);
  } finally {
    videoInput.dispose();
    audioInput.dispose();
  }
}

const adaptation = (type, id, initialization, media) => `<AdaptationSet contentType="${type}" mimeType="${type}/mp4">`
  + `<Representation id="${id}"${type === 'video' ? ' width="160" height="90"' : ''}>`
  + `<SegmentTemplate timescale="1000" initialization="${initialization}" media="${media}">`
  + '<SegmentTimeline><S t="0" d="2022"/></SegmentTimeline></SegmentTemplate>'
  + '</Representation></AdaptationSet>';
const manifest = (adaptations) => '<MPD type="static" mediaPresentationDuration="PT2.022S"><Period>'
  + adaptations + '</Period></MPD>';
const taskFor = (mpd) => {
  const metadata = parseDashMetadata(mpd, manifestUrl);
  const [stream] = metadata.streams;
  return { taskId: 'dash-muxed-test', sourceType: 'dash', title: 'Muxed test', masterUrl: manifestUrl,
    streamUrl: stream.url, ...stream, duration: metadata.duration, resolution: '160x90' };
};
const contextFor = () => ({ controller: new AbortController(), input: null, audioInput: null, output: null, prefetcher: null });
const reporter = () => ({ addBytes: vi.fn(), notePacket: vi.fn(), setPhase: vi.fn() });

describe('segmented DASH embedded audio and probe cleanup', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('rebases muxed video and embedded audio together without losing packets or stretching duration', async () => {
    const combinedBytes = await createMuxedFragment();
    const { initialization, segment } = splitInitialization(combinedBytes);
    const mpd = manifest(adaptation('video', 'v', 'init.mp4', 'part-$Number$.m4s'));
    const storage = createMemoryOpfs();
    const context = contextFor();
    vi.stubGlobal('navigator', storage.navigator);
    const fetchFn = vi.fn(async (input, init) => {
      const url = String(input);
      if (url === manifestUrl) return new Response(mpd);
      if (url === `${base}init.mp4`) return responseFor(initialization, init);
      if (url === `${base}part-1.m4s`) return responseFor(segment, init);
      throw new Error(`Unexpected test URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchFn);
    const original = new Input({ formats: [MP4], source: new BufferSource(combinedBytes) });
    let result;
    try {
      const originalVideo = await original.getPrimaryVideoTrack();
      const originalAudio = await original.getPrimaryAudioTrack();
      expect(await originalVideo.getFirstTimestamp()).toBeCloseTo(10, 6);
      expect(await originalAudio.getFirstTimestamp()).toBeCloseTo(10, 6);
      const temp = await remuxToMp4(taskFor(mpd), reporter(), context);
      result = new Input({ formats: [MP4], source: new BufferSource(await (await temp.handle.getFile()).arrayBuffer()) });
      const videoTrack = await result.getPrimaryVideoTrack();
      const audioTrack = await result.getPrimaryAudioTrack();
      expect(await videoTrack.getFirstTimestamp()).toBeCloseTo(0, 6);
      expect(await audioTrack.getFirstTimestamp()).toBeCloseTo(0, 6);
      expect(await result.computeDuration()).toBeCloseTo(await original.computeDuration() - 10, 6);
      expect(await result.computeDuration()).toBeCloseTo(2.022, 1);
      expect((await packets(videoTrack)).map((packet) => packet.data))
        .toEqual((await packets(originalVideo)).map((packet) => packet.data));
      expect((await packets(audioTrack)).map((packet) => packet.data))
        .toEqual((await packets(originalAudio)).map((packet) => packet.data));
      expect(context.input).toBeNull();
      expect(context.audioInput).toBeNull();
      expect(context.prefetcher).toBeNull();
      expect(fetchFn.mock.calls.some(([url]) => String(url).includes('rplay-downloader.invalid'))).toBe(false);
    } finally {
      result?.dispose();
      original.dispose();
    }
  });

  it('aborts a hanging sibling initialization probe when an audio segment returns HTTP 403', async () => {
    const mpd = manifest(adaptation('video', 'v', 'v-init.mp4', 'v-$Number$.m4s')
      + adaptation('audio', 'a', 'a-init.mp4', 'a-$Number$.m4s'));
    const video = splitInitialization(videoBytes);
    const audio = splitInitialization(audioBytes);
    const storage = createMemoryOpfs();
    const context = contextFor();
    let markStarted;
    const initializationStarted = new Promise((resolve) => { markStarted = resolve; });
    let siblingAborted = false;
    vi.stubGlobal('navigator', storage.navigator);
    const fetchFn = vi.fn(async (input, init) => {
      const url = String(input);
      if (url === manifestUrl) return new Response(mpd);
      if (url === `${base}v-init.mp4`) {
        markStarted();
        return new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => {
          siblingAborted = true;
          reject(new DOMException('Canceled', 'AbortError'));
        }, { once: true }));
      }
      if (url === `${base}a-init.mp4`) return responseFor(audio.initialization, init);
      if (url === `${base}v-1.m4s`) return responseFor(video.segment, init);
      if (url === `${base}a-1.m4s`) {
        // Ensure the sibling passthrough initialization fetch really started;
        // an immediate 403 would fail before exercising its lifecycle.
        await initializationStarted;
        return new Response('Forbidden', { status: 403 });
      }
      throw new Error(`Unexpected test URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchFn);
    try {
      await expect(remuxToMp4(taskFor(mpd), reporter(), context)).rejects.toMatchObject({ code: 'HTTP_403' });
      expect(siblingAborted).toBe(true);
      expect(fetchFn.mock.calls.filter(([url]) => String(url) === `${base}a-1.m4s`)).toHaveLength(1);
      expect(storage.files.size).toBe(0);
      expect(context.input).toBeNull();
      expect(context.audioInput).toBeNull();
      expect(context.prefetcher).toBeNull();
    } finally {
      context.controller.abort();
    }
  });
});
