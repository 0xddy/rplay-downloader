import { getPrefetchableSegmentUrls, getUnsupportedHlsEncryption } from './hls.js';
import { SourceError, isAbortError } from './errors.js';

function inputUrl(input) {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  if (typeof Request !== 'undefined' && input instanceof Request) return input.url;
  return String(input);
}

function requestHeaders(input, init) {
  const headers = new Headers(
    typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined,
  );
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
  return headers;
}

function parseRange(value, size) {
  const match = /^bytes=(\d+)-(\d*)$/i.exec(value || '');
  if (!match) return null;
  const start = Number.parseInt(match[1], 10);
  const requestedEnd = match[2] ? Number.parseInt(match[2], 10) : size - 1;
  if (!Number.isFinite(start) || start < 0 || start >= size) return null;
  return { start, end: Math.min(size - 1, requestedEnd) };
}

function responseFromRecord(record, input, init) {
  const range = parseRange(requestHeaders(input, init).get('Range'), record.bytes.byteLength);
  const start = range?.start || 0;
  const end = range?.end ?? record.bytes.byteLength - 1;
  const body = record.bytes.subarray(start, end + 1);
  const headers = new Headers(record.headers);
  headers.delete('Content-Encoding');
  headers.delete('Transfer-Encoding');
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Content-Length', String(body.byteLength));
  if (range) headers.set('Content-Range', `bytes ${start}-${end}/${record.bytes.byteLength}`);
  else headers.delete('Content-Range');

  const response = new Response(body, {
    status: range ? 206 : 200,
    statusText: range ? 'Partial Content' : 'OK',
    headers,
  });
  try {
    Object.defineProperties(response, {
      url: { value: record.finalUrl },
      redirected: { value: record.redirected },
      type: { value: 'basic' },
    });
  } catch {
    // These fields only help Mediabunny resolve redirected relative paths.
  }
  return response;
}

async function wait(milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export class HlsSegmentPrefetcher {
  constructor(fetchFn, {
    concurrency = 5,
    windowSize = 6,
    retries = 3,
    maxBufferedBytes = Number.POSITIVE_INFINITY,
  } = {}) {
    this.fetchFn = fetchFn;
    this.concurrency = Math.max(1, Math.floor(concurrency));
    this.windowSize = Math.max(this.concurrency, Math.floor(windowSize));
    this.retries = Math.max(1, Math.floor(retries));
    this.maxBufferedBytes = Number.isFinite(maxBufferedBytes) && maxBufferedBytes > 0
      ? Math.floor(maxBufferedBytes)
      : Number.POSITIVE_INFINITY;
    this.bufferedBytes = 0;
    this.controller = new AbortController();
    this.playlists = new Map();
    this.segmentLocations = new Map();
    this.jobs = new Map();
    this.queue = [];
    this.active = 0;
    this.disposed = false;
    this.fetch = this.fetch.bind(this);
  }

  async prepare(playlistUrls) {
    const urls = [...new Set(playlistUrls.filter(Boolean))];
    const prepared = await Promise.all(urls.map(async (url) => {
      const record = await this.loadRecord(url);
      const text = new TextDecoder().decode(record.bytes);
      if (getUnsupportedHlsEncryption(text)) {
        throw new SourceError('已识别到 DRM / SAMPLE-AES 受保护媒体，当前扩展不支持下载', 'DRM_UNSUPPORTED');
      }
      const segments = getPrefetchableSegmentUrls(text, record.finalUrl || url);
      return { requestUrl: url, record, segments };
    }));

    for (const playlist of prepared) {
      this.playlists.set(playlist.requestUrl, playlist.record);
      this.playlists.set(playlist.record.finalUrl, playlist.record);
      playlist.segments.forEach((url, index) => {
        if (!this.segmentLocations.has(url)) {
          this.segmentLocations.set(url, { segments: playlist.segments, index });
        }
      });
    }

    // Interleave video/audio prefetch jobs so an external audio playlist cannot
    // be starved behind a full video window.
    for (let offset = 0; offset < this.windowSize; offset++) {
      for (const playlist of prepared) {
        const url = playlist.segments[offset];
        if (url) this.enqueue(url, false, false);
      }
    }
    this.pump();
  }

  async fetch(input, init = {}) {
    if (this.disposed) return this.fetchFn(input, init);
    const url = inputUrl(input);
    const playlist = this.playlists.get(url);
    if (playlist) return responseFromRecord(playlist, input, init);

    const location = this.segmentLocations.get(url);
    if (!location) return this.fetchFn(input, init);

    this.scheduleWindow(location.segments, location.index);
    const job = this.enqueue(url, true);
    try {
      const record = await job.promise;
      return responseFromRecord(record, input, init);
    } finally {
      if (this.jobs.get(url) === job) this.releaseJob(job);
    }
  }

  scheduleWindow(segments, start) {
    for (let index = start; index < Math.min(segments.length, start + this.windowSize); index++) {
      this.enqueue(segments[index], index === start);
    }
  }

  enqueue(url, priority = false, startPump = true) {
    let job = this.jobs.get(url);
    if (job) {
      if (priority) job.priority = true;
      if (priority && job.state === 'queued') {
        const index = this.queue.indexOf(job);
        if (index > 0) {
          this.queue.splice(index, 1);
          this.queue.unshift(job);
        }
      }
      if (startPump) this.pump();
      return job;
    }

    let resolve;
    let reject;
    const promise = new Promise((onResolve, onReject) => {
      resolve = onResolve;
      reject = onReject;
    });
    // Prefetched jobs can fail before Mediabunny requests them. Keep the
    // rejection observable to the future consumer without an unhandled event.
    void promise.catch(() => {});
    job = {
      url,
      promise,
      resolve,
      reject,
      state: 'queued',
      priority,
      byteLength: 0,
    };
    this.jobs.set(url, job);
    if (priority) this.queue.unshift(job);
    else this.queue.push(job);
    if (startPump) this.pump();
    return job;
  }

  pump() {
    while (!this.disposed && this.active < this.concurrency && this.queue.length > 0) {
      const next = this.queue[0];
      if (this.bufferedBytes >= this.maxBufferedBytes && !next.priority) break;
      const job = this.queue.shift();
      if (job.state !== 'queued') continue;
      job.state = 'loading';
      this.active++;
      void this.loadRecord(job.url)
        .then((record) => {
          if (this.disposed) throw new DOMException('Aborted', 'AbortError');
          job.state = 'ready';
          job.byteLength = record.bytes.byteLength;
          this.bufferedBytes += job.byteLength;
          job.resolve(record);
        })
        .catch((error) => {
          job.state = 'error';
          job.reject(error);
        })
        .finally(() => {
          this.active--;
          this.pump();
        });
    }
  }

  releaseJob(job) {
    this.jobs.delete(job.url);
    this.bufferedBytes = Math.max(0, this.bufferedBytes - job.byteLength);
    job.byteLength = 0;
    this.pump();
  }

  async loadRecord(url) {
    let lastError;
    for (let attempt = 0; attempt < this.retries; attempt++) {
      if (this.controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      try {
        const response = await this.fetchFn(url, { signal: this.controller.signal });
        const bytes = new Uint8Array(await response.arrayBuffer());
        return {
          bytes,
          headers: response.headers,
          finalUrl: response.url || url,
          redirected: response.redirected,
        };
      } catch (error) {
        lastError = error;
        if (this.controller.signal.aborted || isAbortError(error) || /^HTTP_4\d\d$/.test(error?.code || '')
          || attempt === this.retries - 1) throw error;
        await wait(400 * 2 ** attempt);
      }
    }
    throw lastError;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.controller.abort();
    // Queued jobs have no running fetch to receive the abort signal. Reject
    // their consumers too, otherwise cancellation can wait forever on them.
    for (const job of this.jobs.values()) job.reject(new DOMException('Aborted', 'AbortError'));
    this.queue.length = 0;
    this.playlists.clear();
    this.segmentLocations.clear();
    this.jobs.clear();
    this.bufferedBytes = 0;
  }
}
