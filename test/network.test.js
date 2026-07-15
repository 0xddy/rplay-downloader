import { afterEach, describe, expect, it, vi } from 'vitest';
import { TaskCanceledError } from '../src/errors.js';
import { fetchWithRetry } from '../src/network.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('network retries', () => {
  it('retries a transient request and returns the successful response', async () => {
    vi.useFakeTimers();
    const response = new Response('ok');
    const fetchFn = vi.fn()
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce(response);

    const resultPromise = fetchWithRetry(fetchFn, 'https://example.test/video');
    await vi.runAllTimersAsync();

    await expect(resultPromise).resolves.toBe(response);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('does not retry a canceled task', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TaskCanceledError());

    await expect(fetchWithRetry(fetchFn, 'https://example.test/video')).rejects.toMatchObject({
      code: 'TASK_CANCELED',
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
