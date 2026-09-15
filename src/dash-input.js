import { HLS_FORMATS, Input, MP4, UrlSource } from 'mediabunny';
import { inspectDashManifest } from './dash-metadata.js';
import { FETCH_PARALLELISM, PREFETCH_MAX_BYTES, SOURCE_CACHE_SIZE } from './download-config.js';
import { SourceError, isAbortError } from './errors.js';
import { HlsSegmentPrefetcher } from './hls-prefetch.js';
import { combineSignals } from './network.js';

const VIRTUAL_ORIGIN = 'https://rplay-downloader.invalid';

function segmentedPlaylist(description) {
  const quote = (url) => {
    // URL serialisation escapes line breaks/quotes; reject them defensively
    // before embedding any manifest-provided URI in the internal playlist.
    if (/[\r\n"]/.test(url)) throw new SourceError('DASH 分片地址无效', 'DASH_UNSUPPORTED');
    return url;
  };
  return '#EXTM3U\n#EXT-X-VERSION:7\n#EXT-X-PLAYLIST-TYPE:VOD\n'
    + `#EXT-X-TARGETDURATION:${Math.ceil(Math.max(...description.segments.map((segment) => segment.duration)))}\n`
    + `#EXT-X-MAP:URI="${quote(description.initializationUrl)}"\n`
    + description.segments.map((segment) => `#EXTINF:${segment.duration},\n${quote(segment.url)}\n`).join('')
    + '#EXT-X-ENDLIST\n';
}

function virtualPlaylistFetch(playlists, fetchFn) {
  return async (input, init = {}) => {
    const url = input instanceof Request ? input.url : String(input);
    const playlist = playlists.get(url);
    if (playlist !== undefined) {
      if (init.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const response = new Response(playlist, { headers: { 'Content-Type': 'application/vnd.apple.mpegurl' } });
      Object.defineProperty(response, 'url', { value: url });
      return response;
    }
    // Internal playlists must never turn into requests to an external host.
    if (new URL(url).origin === VIRTUAL_ORIGIN) {
      throw new SourceError('DASH 内部分片索引无效', 'DASH_UNSUPPORTED');
    }
    return fetchFn(input, init);
  };
}

export async function openDashInputs(task, fetchFn, context) {
  // Re-read the MPD at download time: cached detection metadata can be stale.
  const metadata = await inspectDashManifest(task.masterUrl, fetchFn);
  const stream = metadata.streams.find((candidate) => (
    candidate.url === task.streamUrl
    && (!task.representationId || candidate.representationId === task.representationId)
  ));
  if (!stream) throw new SourceError('所选 DASH 画质已失效，请刷新视频页面后重新选择', 'DASH_SELECTION_CHANGED');
  if (stream.unavailableReason) {
    throw new SourceError('当前支持单时段 VOD 的完整 MP4/CMAF 轨道或连续 SegmentTemplate/SegmentTimeline 分段，不支持此 DASH 布局', 'DASH_UNSUPPORTED');
  }
  if ((stream.audioUrl || null) !== (task.audioUrl || null)
    || (task.audioRepresentationId && stream.audioRepresentationId !== task.audioRepresentationId)) {
    throw new SourceError('DASH 音轨已发生变化，请刷新视频页面后重新选择', 'DASH_SELECTION_CHANGED');
  }
  const playlists = new Map();
  const playlistUrl = (type) => `${VIRTUAL_ORIGIN}/${encodeURIComponent(task.taskId)}/${type}.m3u8`;
  if (stream.videoSegments) playlists.set(playlistUrl('video'), segmentedPlaylist(stream.videoSegments));
  if (stream.audioSegments) playlists.set(playlistUrl('audio'), segmentedPlaylist(stream.audioSegments));
  let mediaFetch = fetchFn;
  if (playlists.size) {
    // Reuse the public segmented-fMP4 reader through an in-memory playlist.
    // This is an internal index only: no HLS playlist is fetched from RPlay,
    // and ISOBMFF sample encryption still uses the existing DASH key resolver.
    const prefetcher = new HlsSegmentPrefetcher(virtualPlaylistFetch(playlists, fetchFn), {
      concurrency: FETCH_PARALLELISM,
      windowSize: FETCH_PARALLELISM + 1,
      maxBufferedBytes: PREFETCH_MAX_BYTES,
    });
    context.prefetcher = prefetcher;
    await prefetcher.prepare([...playlists.keys()]);
    mediaFetch = prefetcher.fetch;
  }
  const createInput = (url, segmented = false, initInput, inputFetch = mediaFetch) => new Input({
    formats: segmented ? HLS_FORMATS : [MP4],
    initInput,
    source: new UrlSource(url, {
      requestInit: { credentials: 'include' },
      parallelism: FETCH_PARALLELISM,
      maxCacheSize: SOURCE_CACHE_SIZE,
      fetchFn: inputFetch,
      getRetryDelay: (attempts, error) => {
        if (isAbortError(error) || /^HTTP_4\d\d$/.test(error?.code || '')) return null;
        return attempts < 2 ? 0.5 * 2 ** attempts : null;
      },
    }),
    formatOptions: { hls: { offsetTimestampsByDateTime: false }, isobmff: {
      resolveKeyId: context.resolveMediaKey,
    } },
  });
  const timestampProbes = new Set();
  const probeController = new AbortController();
  const probeFetch = (input, init = {}) => mediaFetch(input, {
    ...init, signal: combineSignals(probeController.signal, init.signal),
  });
  const originalTimestampOffset = async (description) => {
    if (!description) return 0;
    const initialization = createInput(description.initializationUrl, false, undefined, probeFetch);
    timestampProbes.add(initialization);
    let firstSegment;
    try {
      firstSegment = createInput(description.segments[0].url, false, initialization, probeFetch);
      timestampProbes.add(firstSegment);
      // The segmented reader rebases its first input to zero independently
      // for video/audio. Restore the container offset (including AAC preroll)
      // before remuxing, instead of silently changing their relative timing.
      const timestamp = await firstSegment.getFirstTimestamp();
      if (!Number.isFinite(timestamp)) throw new SourceError('DASH 首分片没有可用轨道时间戳', 'EMPTY_MEDIA_TRACK');
      return timestamp;
    } finally {
      firstSegment?.dispose();
      initialization.dispose();
      timestampProbes.delete(firstSegment);
      timestampProbes.delete(initialization);
    }
  };
  let videoTimestampOffset;
  let audioTimestampOffset;
  try {
    [videoTimestampOffset, audioTimestampOffset] = await Promise.all([
      originalTimestampOffset(stream.videoSegments), originalTimestampOffset(stream.audioSegments),
    ]);
  } catch (error) {
    // A failure in one track must abort the sibling probe too; initialization
    // reads bypass the segment queue and otherwise could outlive the task.
    // UrlSource.dispose does not immediately abort a fetch still awaiting
    // response headers. Explicitly abort those sibling initialization reads.
    probeController.abort();
    for (const probe of timestampProbes) probe.dispose();
    throw error;
  } finally {
    probeController.abort();
  }
  context.input = createInput(stream.videoSegments ? playlistUrl('video') : stream.url, Boolean(stream.videoSegments));
  if (stream.audioUrl && stream.audioUrl !== stream.url) {
    context.audioInput = createInput(stream.audioSegments ? playlistUrl('audio') : stream.audioUrl, Boolean(stream.audioSegments));
  }
  return { input: context.input, audioInput: context.audioInput || null, duration: metadata.duration,
    videoTimestampOffset, audioTimestampOffset };
}
