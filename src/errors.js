export const ErrorKind = Object.freeze({
  SOURCE: 'source',
  COMPATIBILITY: 'compatibility',
  UNSUPPORTED: 'unsupported',
  CANCELED: 'canceled',
  INTERNAL: 'internal',
});

export class RPlayError extends Error {
  constructor(message, code, options = {}) {
    super(message, options);
    this.name = this.constructor.name;
    this.code = code;
    this.kind = options.kind || ErrorKind.INTERNAL;
  }
}

export class SourceError extends RPlayError {
  constructor(message, code = 'SOURCE_ERROR', options) {
    super(message, code, { ...options, kind: ErrorKind.SOURCE });
    this.isSourceError = true;
  }
}

export class RemuxCompatibilityError extends RPlayError {
  constructor(message, options) {
    super(message, 'REMUX_INCOMPATIBLE', { ...options, kind: ErrorKind.COMPATIBILITY });
    this.canFallbackToTs = true;
  }
}

export class UnsupportedFallbackError extends RPlayError {
  constructor(message, code = 'TS_FALLBACK_UNSUPPORTED', options) {
    super(message, code, { ...options, kind: ErrorKind.UNSUPPORTED });
  }
}

export class TaskCanceledError extends RPlayError {
  constructor(message = '下载任务已取消') {
    super(message, 'TASK_CANCELED', { kind: ErrorKind.CANCELED });
  }
}

export function isAbortError(error) {
  return error?.name === 'AbortError' || error?.code === 'TASK_CANCELED';
}

export function isSourceFailure(error) {
  if (error?.kind) return error.kind === ErrorKind.SOURCE;
  if (error?.isSourceError) return true;
  const text = `${error?.name || ''} ${error?.message || error || ''}`.toLowerCase();
  return /network|fetch|http\s*\d+|manifest|playlist|m3u8|密钥|解密|decrypt|cors|unauthori[sz]ed|forbidden|not found/.test(text);
}

export function shouldFallbackToTs(error) {
  return error?.kind === ErrorKind.COMPATIBILITY && error?.canFallbackToTs === true;
}
