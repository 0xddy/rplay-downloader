import { describe, expect, it, vi } from 'vitest';
import { abortDownloadContext } from '../src/download-session.js';

describe('download session cancellation', () => {
  it('acknowledges cancellation without waiting for a hanging muxer cleanup', () => {
    const cancel = vi.fn(() => new Promise(() => {}));
    const context = {
      controller: new AbortController(),
      prefetcher: { dispose: vi.fn() },
      input: { dispose: vi.fn() },
      output: { state: 'started', cancel },
    };

    expect(abortDownloadContext(context)).toBe(true);
    expect(context.controller.signal.aborted).toBe(true);
    expect(context.prefetcher.dispose).toHaveBeenCalledOnce();
    expect(context.input.dispose).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledOnce();
  });
});
