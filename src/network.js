import { SourceError, TaskCanceledError, isAbortError } from './errors.js';

function combineSignals(...signals) {
  const available = signals.filter(Boolean);
  if (available.length === 0) return undefined;
  if (available.length === 1) return available[0];
  if (typeof AbortSignal.any === 'function') return AbortSignal.any(available);

  // Compatibility path for older browsers. Chrome 116+ uses AbortSignal.any,
  // which avoids accumulating one userland listener per media segment.
  const controller = new AbortController();
  const abort = () => controller.abort();
  for (const signal of available) {
    if (signal.aborted) {
      controller.abort();
      break;
    }
    signal.addEventListener('abort', abort, { once: true });
  }
  return controller.signal;
}

export function createTrackedFetch(reporter, taskController) {
  return async (input, init = {}) => {
    if (taskController.signal.aborted) throw new TaskCanceledError();
    const signal = combineSignals(taskController.signal, init.signal);
    let response;
    try {
      response = await fetch(input, { ...init, credentials: 'include', signal });
    } catch (error) {
      if (taskController.signal.aborted || isAbortError(error)) throw new TaskCanceledError();
      throw new SourceError(`网络请求失败：${error?.message || error}`, 'NETWORK_ERROR', { cause: error });
    }
    if (!response.ok) {
      throw new SourceError(`资源请求失败：HTTP ${response.status}`, `HTTP_${response.status}`);
    }
    if (!response.body) return response;

    const stream = response.body.pipeThrough(new TransformStream({
      transform(chunk, controller) {
        reporter.addBytes(chunk.byteLength);
        controller.enqueue(chunk);
      },
    }));
    const tracked = new Response(stream, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
    try {
      Object.defineProperties(tracked, {
        url: { value: response.url },
        redirected: { value: response.redirected },
        type: { value: response.type },
      });
    } catch {
      // These properties are only used for diagnostics and relative URL resolution.
    }
    return tracked;
  };
}

export async function fetchWithRetry(fetchFn, url, init = {}, attempts = 3) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fetchFn(url, init);
    } catch (error) {
      lastError = error;
      if (isAbortError(error) || attempt === attempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
    }
  }
  throw lastError;
}
