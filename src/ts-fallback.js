import { FETCH_PARALLELISM } from './download-config.js';
import {
  SourceError,
  TaskCanceledError,
  UnsupportedFallbackError,
} from './errors.js';
import {
  decryptAes128,
  generateSequenceIv,
  looksLikeTransportStream,
  parseIv,
  parseMediaPlaylist,
  processInOrderedBatches,
} from './hls.js';
import { createTrackedFetch, fetchWithRetry } from './network.js';
import { createTempFile, removeTempFile } from './opfs.js';
import { TaskPhase } from './protocol.js';

async function importAesKey(segmentKey, keyCache, fetchFn) {
  if (!segmentKey) return null;
  if (!keyCache.has(segmentKey.uri)) {
    keyCache.set(segmentKey.uri, (async () => {
      const response = await fetchWithRetry(fetchFn, segmentKey.uri);
      const raw = await response.arrayBuffer();
      if (raw.byteLength !== 16) throw new SourceError('AES-128 密钥长度不是 16 字节', 'INVALID_KEY_LENGTH');
      return crypto.subtle.importKey('raw', raw, { name: 'AES-CBC' }, false, ['decrypt']);
    })());
  }
  return keyCache.get(segmentKey.uri);
}

export async function downloadFallbackTs(task, reporter, context, fallbackReason) {
  if (task.hasExternalAudio) {
    throw new UnsupportedFallbackError('该清晰度使用独立音频轨道，无法安全回退为单个 TS 文件');
  }
  const temp = await createTempFile(task.taskId, 'ts');
  const trackedFetch = createTrackedFetch(reporter, context.controller);
  let writable = null;
  try {
    const playlistResponse = await fetchWithRetry(trackedFetch, task.streamUrl);
    const sessionKey = (task.sessionKeys || []).find((key) => (
      key.method === 'AES-128' && key.uri && (!key.keyFormat || key.keyFormat === 'identity')
    ));
    const playlist = parseMediaPlaylist(await playlistResponse.text(), task.streamUrl, sessionKey || null);
    writable = await temp.handle.createWritable({ keepExistingData: false });
    const keyCache = new Map();

    reporter.setPhase(TaskPhase.FALLBACK_TS, 'MP4 封装失败，正在回退下载原始 TS…', {
      actualFormat: 'ts',
      fallbackReason,
      mediaProgress: 0,
    });

    await processInOrderedBatches(
      playlist.segments,
      FETCH_PARALLELISM,
      async (segment) => {
        if (context.controller.signal.aborted) throw new TaskCanceledError();
        const response = await fetchWithRetry(trackedFetch, segment.url);
        let data = await response.arrayBuffer();
        if (segment.key) {
          const key = await importAesKey(segment.key, keyCache, trackedFetch);
          const iv = segment.key.iv ? parseIv(segment.key.iv) : generateSequenceIv(segment.sequence);
          try {
            data = await decryptAes128(data, key, iv);
          } catch (error) {
            throw new SourceError(`片段 ${segment.sequence} 解密失败`, 'DECRYPT_FAILED', { cause: error });
          }
        }
        return new Uint8Array(data);
      },
      async (data, _segment, index) => {
        if (index === 0 && !looksLikeTransportStream(data)) {
          throw new UnsupportedFallbackError('媒体片段不是 MPEG-TS，无法执行 TS 回退');
        }
        await writable.write(data);
        reporter.noteFallbackSegment(index + 1, playlist.segments.length);
      },
    );
    await writable.close();
    writable = null;
    const file = await temp.handle.getFile();
    if (file.size === 0) throw new SourceError('TS 输出文件为空', 'EMPTY_TS_OUTPUT');
    return { ...temp, size: file.size };
  } catch (error) {
    if (writable) await writable.abort().catch(() => {});
    await removeTempFile(temp);
    throw error;
  }
}
