import { Input, MP4, UrlSource } from 'mediabunny';
import { inspectDashManifest } from './dash-metadata.js';
import { FETCH_PARALLELISM, SOURCE_CACHE_SIZE } from './download-config.js';
import { SourceError, isAbortError } from './errors.js';

export async function openDashInputs(task, fetchFn, context) {
  // Re-read the MPD at download time: cached detection metadata can be stale.
  const metadata = await inspectDashManifest(task.masterUrl, fetchFn);
  const stream = metadata.streams.find((candidate) => (
    candidate.url === task.streamUrl
    && (!task.representationId || candidate.representationId === task.representationId)
  ));
  if (!stream) throw new SourceError('所选 DASH 画质已失效，请刷新视频页面后重新选择', 'DASH_SELECTION_CHANGED');
  if (stream.unavailableReason) {
    throw new SourceError('当前仅支持单时段 VOD 的完整 MP4/CMAF 轨道，不支持此 DASH 分段布局', 'DASH_UNSUPPORTED');
  }
  if ((stream.audioUrl || null) !== (task.audioUrl || null)) {
    throw new SourceError('DASH 音轨已发生变化，请刷新视频页面后重新选择', 'DASH_SELECTION_CHANGED');
  }
  const createInput = (url) => new Input({
    formats: [MP4],
    source: new UrlSource(url, {
      requestInit: { credentials: 'include' },
      parallelism: FETCH_PARALLELISM,
      maxCacheSize: SOURCE_CACHE_SIZE,
      fetchFn,
      getRetryDelay: (attempts, error) => {
        if (isAbortError(error) || /^HTTP_4\d\d$/.test(error?.code || '')) return null;
        return attempts < 2 ? 0.5 * 2 ** attempts : null;
      },
    }),
    formatOptions: { isobmff: {
      resolveKeyId: context.resolveMediaKey,
    } },
  });
  context.input = createInput(stream.url);
  if (stream.audioUrl && stream.audioUrl !== stream.url) context.audioInput = createInput(stream.audioUrl);
  return { input: context.input, audioInput: context.audioInput || null, duration: metadata.duration };
}
