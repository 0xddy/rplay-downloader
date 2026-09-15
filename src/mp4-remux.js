import {
  EncodedAudioPacketSource,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  HLS_FORMATS,
  Input,
  Mp4OutputFormat,
  Output,
  StreamTarget,
  UrlSource,
} from 'mediabunny';
import {
  FETCH_PARALLELISM,
  PREFETCH_MAX_BYTES,
  SOURCE_CACHE_SIZE,
  TARGET_CHUNK_SIZE,
} from './download-config.js';
import {
  RemuxCompatibilityError,
  SourceError,
  TaskCanceledError,
  isAbortError,
  isSourceFailure,
} from './errors.js';
import { resolveOutputRotation } from './hls.js';
import { HlsSegmentPrefetcher } from './hls-prefetch.js';
import { createTrackedFetch } from './network.js';
import { createTempFile, removeTempFile } from './opfs.js';
import { TaskPhase } from './protocol.js';
import { openDashInputs } from './dash-input.js';

async function selectTracks(input, task) {
  let videoTracks;
  try {
    if (!(await input.canRead())) throw new SourceError('无法读取媒体来源', 'UNREADABLE_MEDIA');
    videoTracks = await input.getVideoTracks();
  } catch (error) {
    if (error instanceof SourceError || isSourceFailure(error)) throw error;
    throw new SourceError(`媒体轨道解析失败：${error?.message || error}`, 'INVALID_MEDIA', { cause: error });
  }
  if (videoTracks.length === 0) throw new SourceError('媒体来源中没有视频轨道', 'NO_VIDEO_TRACK');

  const candidates = await Promise.all(videoTracks.map(async (track) => ({
    track,
    width: await track.getCodedWidth(),
    height: await track.getCodedHeight(),
    bitrate: await track.getBitrate(),
  })));
  const exact = task.width > 0 && task.height > 0 ? candidates.filter((candidate) => (
    candidate.width === task.width && candidate.height === task.height
  )) : candidates;
  if (exact.length === 0) {
    throw new RemuxCompatibilityError(`未找到所选分辨率 ${task.resolution} 对应的视频轨道`);
  }
  exact.sort((left, right) => {
    if (!task.bandwidth) return (right.bitrate || 0) - (left.bitrate || 0);
    return Math.abs((left.bitrate || 0) - task.bandwidth) - Math.abs((right.bitrate || 0) - task.bandwidth);
  });
  const videoTrack = exact[0].track;
  let audioTrack = await videoTrack.getPrimaryPairableAudioTrack().catch(() => null);
  if (!audioTrack) {
    const audioTracks = await input.getAudioTracks();
    if (audioTracks.length === 1) audioTrack = audioTracks[0];
  }
  return { videoTrack, audioTrack };
}

async function pipeTracks(tracks, baseTimestamp, duration, reporter, context) {
  const states = tracks.map((track) => ({
    ...track,
    iterator: track.sink.packets(
      track.firstPacket,
      undefined,
      track.verifyKeyPackets ? { verifyKeyPackets: true } : undefined,
    )[Symbol.asyncIterator](),
    next: null,
    closed: false,
  }));
  await Promise.all(states.map(async (state) => {
    state.next = await state.iterator.next();
  }));

  while (states.some((state) => !state.next.done)) {
    if (context.controller.signal.aborted) throw new TaskCanceledError();
    const available = states.filter((state) => !state.next.done);
    available.sort((left, right) => (left.next.value.timestamp + (left.timestampOffset || 0))
      - (right.next.value.timestamp + (right.timestampOffset || 0)));
    const state = available[0];
    const packet = state.next.value;
    const normalized = packet.clone({ timestamp: packet.timestamp + (state.timestampOffset || 0) - baseTimestamp });
    await state.source.add(normalized, { decoderConfig: state.decoderConfig });
    reporter.notePacket(normalized.timestamp + normalized.duration, duration);
    state.next = await state.iterator.next();
    if (state.next.done && !state.closed) {
      state.source.close();
      state.closed = true;
    }
  }
}

export async function remuxToMp4(task, reporter, context) {
  const temp = await createTempFile(task.taskId, 'mp4');
  const trackedFetch = createTrackedFetch(reporter, context.controller);
  let prefetcher = null;
  let input = null;
  let audioInput = null;
  let sourceDuration = task.duration || null;
  let videoTimestampOffset = 0;
  let audioTimestampOffset = 0;

  try {
    if (task.sourceType === 'dash') {
      const dash = await openDashInputs(task, trackedFetch, context);
      input = dash.input;
      audioInput = dash.audioInput;
      sourceDuration = dash.duration || sourceDuration;
      videoTimestampOffset = dash.videoTimestampOffset || 0;
      audioTimestampOffset = dash.audioTimestampOffset || 0;
    } else {
      prefetcher = new HlsSegmentPrefetcher(trackedFetch, {
        concurrency: FETCH_PARALLELISM,
        windowSize: FETCH_PARALLELISM + 1,
        maxBufferedBytes: PREFETCH_MAX_BYTES,
      });
      context.prefetcher = prefetcher;
      // Cache the master too because some RPlay playlist endpoints ignore Range
      // requests and do not have an .m3u8 path suffix.
      await prefetcher.prepare([task.masterUrl, task.streamUrl, task.audioUrl]);
      input = new Input({
        formats: HLS_FORMATS,
        source: new UrlSource(task.masterUrl, {
          requestInit: { credentials: 'include' },
          parallelism: FETCH_PARALLELISM,
          maxCacheSize: SOURCE_CACHE_SIZE,
          fetchFn: prefetcher.fetch,
          getRetryDelay: (previousAttempts) => previousAttempts < 2 ? 0.5 * 2 ** previousAttempts : null,
        }),
        formatOptions: { hls: { offsetTimestampsByDateTime: false } },
      });
    }
    context.input = input;
    let { videoTrack, audioTrack } = await selectTracks(input, task);
    if (audioInput) {
      if (!(await audioInput.canRead())) throw new SourceError('无法读取 DASH 音频轨道', 'UNREADABLE_AUDIO');
      const audioTracks = await audioInput.getAudioTracks();
      if (audioTracks.length !== 1) throw new SourceError('所选 DASH 音轨未包含唯一音频轨道', 'INVALID_AUDIO_TRACK');
      [audioTrack] = audioTracks;
    } else {
      // Embedded audio is read from the same segmented input as video, so
      // both tracks must restore that input's shared timestamp offset.
      audioTimestampOffset = videoTimestampOffset;
    }
    if (await videoTrack.isLive()) {
      throw new SourceError('当前版本只支持 VOD/回放，不支持持续直播录制', 'LIVE_UNSUPPORTED');
    }

    const videoCodec = await videoTrack.getCodec();
    const audioCodec = audioTrack ? await audioTrack.getCodec() : null;
    const format = new Mp4OutputFormat({ fastStart: false });
    const supportedCodecs = format.getSupportedCodecs();
    if (!videoCodec || !supportedCodecs.includes(videoCodec)) {
      throw new RemuxCompatibilityError(`MP4 不支持视频编码 ${videoCodec || 'UNKNOWN'}`);
    }
    if (audioTrack && (!audioCodec || !supportedCodecs.includes(audioCodec))) {
      throw new RemuxCompatibilityError(`MP4 不支持音频编码 ${audioCodec || 'UNKNOWN'}`);
    }

    const videoSink = new EncodedPacketSink(videoTrack);
    const audioSink = audioTrack ? new EncodedPacketSink(audioTrack) : null;
    const [videoFirst, audioFirst, videoConfig, audioConfig] = await Promise.all([
      videoSink.getFirstPacket({ verifyKeyPackets: true }),
      audioSink?.getFirstPacket() || null,
      videoTrack.getDecoderConfig(),
      audioTrack?.getDecoderConfig() || null,
    ]);
    if (!videoFirst) throw new SourceError('视频轨道没有可用 packet', 'EMPTY_VIDEO_TRACK');
    if (audioTrack && !audioFirst) throw new SourceError('音频轨道没有可用 packet', 'EMPTY_AUDIO_TRACK');
    if (!videoConfig) throw new RemuxCompatibilityError('无法获取视频轨道初始化参数');
    if (audioTrack && audioFirst && !audioConfig) {
      throw new RemuxCompatibilityError('无法获取音频轨道初始化参数');
    }

    const firstTimestamps = [videoFirst.timestamp + videoTimestampOffset];
    if (audioFirst) firstTimestamps.push(audioFirst.timestamp + audioTimestampOffset);
    const baseTimestamp = Math.min(...firstTimestamps);
    let duration = sourceDuration;
    if (!duration) {
      const durations = await Promise.all([
        input.getDurationFromMetadata([videoTrack, ...(!audioInput && audioTrack ? [audioTrack] : [])]),
        audioInput ? audioInput.getDurationFromMetadata([audioTrack]) : null,
      ]);
      const knownDurations = durations.filter((value) => Number.isFinite(value) && value > 0);
      duration = knownDurations.length > 0 ? Math.max(...knownDurations) : null;
    }

    const writable = await temp.handle.createWritable({ keepExistingData: false });
    const target = new StreamTarget(writable, { chunked: true, chunkSize: TARGET_CHUNK_SIZE });
    const output = new Output({ format, target });
    context.output = output;
    const videoSource = new EncodedVideoPacketSource(videoCodec);
    const audioSource = audioTrack && audioFirst ? new EncodedAudioPacketSource(audioCodec) : null;
    const [codedWidth, codedHeight, inputRotation] = await Promise.all([
      videoTrack.getCodedWidth(),
      videoTrack.getCodedHeight(),
      videoTrack.getRotation(),
    ]);
    const outputRotation = resolveOutputRotation(
      task.width,
      task.height,
      codedWidth,
      codedHeight,
      inputRotation,
    );
    output.addVideoTrack(videoSource, { rotation: outputRotation });
    if (audioSource) {
      output.addAudioTrack(audioSource, { languageCode: await audioTrack.getLanguageCode() });
    }
    output.setMetadataTags({ title: task.title });

    reporter.setPhase(TaskPhase.REMUXING, '正在无转码封装 MP4…');
    await output.start();
    await pipeTracks([
      {
        sink: videoSink,
        source: videoSource,
        firstPacket: videoFirst,
        decoderConfig: videoConfig,
        verifyKeyPackets: true,
        timestampOffset: videoTimestampOffset,
      },
      ...(audioSource ? [{
        sink: audioSink,
        source: audioSource,
        firstPacket: audioFirst,
        decoderConfig: audioConfig,
        verifyKeyPackets: false,
        timestampOffset: audioTimestampOffset,
      }] : []),
    ], baseTimestamp, duration, reporter, context);
    await output.finalize();
    context.output = null;
    const file = await temp.handle.getFile();
    if (file.size === 0) throw new RemuxCompatibilityError('MP4 输出文件为空');
    return { ...temp, size: file.size };
  } catch (error) {
    if (context.output && !['canceled', 'finalized'].includes(context.output.state)) {
      await context.output.cancel().catch(() => {});
    }
    await removeTempFile(temp);
    if (isAbortError(error) || context.controller.signal.aborted) throw new TaskCanceledError();
    if (error instanceof SourceError || error instanceof RemuxCompatibilityError || isSourceFailure(error)) throw error;
    throw new RemuxCompatibilityError(`MP4 换封装失败：${error?.message || error}`, { cause: error });
  } finally {
    input?.dispose();
    audioInput?.dispose();
    // Input construction can fail before assignment above, so also clean up
    // handles that openDashInputs already registered for cancellation.
    if (context.input !== input) context.input?.dispose();
    if (context.audioInput !== audioInput) context.audioInput?.dispose();
    prefetcher?.dispose();
    if (context.prefetcher !== prefetcher) context.prefetcher?.dispose();
    context.input = null;
    context.audioInput = null;
    context.prefetcher = null;
    context.output = null;
  }
}
