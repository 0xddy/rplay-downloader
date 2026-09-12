import { describe, expect, it, vi } from 'vitest';
import { createCdmKeyResolver, isWidevineLicenseUrl } from '../src/cdm-client.js';
import { BrowserCdm, importWvd } from '../src/cdm-browser.js';
import { syntheticLicense, syntheticWvd } from './helpers/cdm-fixtures.js';

const kid = '00112233445566778899aabbccddeeff';
const key = Uint8Array.from({ length: 16 }, (_, index) => index);
const licenseUrl = 'https://widevine-dash.ezdrm.com/widevine-php/widevine-foreignkey.php?token=test-only';
const psshBoxes = [{ systemId: 'edef8ba979d64acea3c827dcd51d21ed', keyIds: null, data: new Uint8Array([18, 16, ...new Uint8Array(16)]) }];
const args = { keyId: kid, psshBoxes };
const device = await importWvd(syntheticWvd());
function setup(overrides = {}, dependencies = {}) {
  const context = { controller: new AbortController() };
  const cdm = new BrowserCdm(device);
  const fetchFn = vi.fn(async (_url, init) => new Response(syntheticLicense(init.body)));
  const resolve = createCdmKeyResolver({ licenseUrl, ...overrides }, context, {
    fetchFn, createCdm: async () => cdm, ...dependencies,
  });
  return { context, fetchFn, resolve, cdm };
}

describe('browser CDM license integration', () => {
  it('authorizes once for concurrent tracks and releases transient sessions', async () => {
    const { resolve, fetchFn, cdm } = setup();
    expect(await Promise.all([resolve(args), resolve(args)])).toEqual([key, key]);
    expect(await resolve(args)).toEqual(key);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0][0]).toBe(licenseUrl);
    expect(fetchFn.mock.calls[0][1].headers.Authorization).toBeUndefined();
    expect(cdm.sessions.size).toBe(0);
    resolve.dispose();
    expect(cdm.disposed).toBe(true);
    await expect(resolve(args)).rejects.toMatchObject({ code: 'TASK_CANCELED' });
  });

  it('requires a device and captured site authorization only for encrypted samples', async () => {
    const { resolve, fetchFn } = setup({ licenseUrl: null });
    expect(fetchFn).not.toHaveBeenCalled();
    await expect(resolve(args)).rejects.toMatchObject({ code: 'LICENSE_URL_REQUIRED' });
    await expect(setup({}, { createCdm: async () => new BrowserCdm(null) }).resolve(args))
      .rejects.toMatchObject({ code: 'CDM_NOT_CONFIGURED' });
  });

  it('reports license denial without leaking the login URL and still releases the session', async () => {
    const { resolve, fetchFn, cdm } = setup();
    fetchFn.mockResolvedValueOnce(new Response('denied', { status: 403 }));
    await expect(resolve(args)).rejects.toMatchObject({ code: 'LICENSE_REJECTED', message: expect.not.stringContaining('token=') });
    expect(cdm.sessions.size).toBe(0);
  });

  it('propagates cancellation during authorization and closes the opened session', async () => {
    const { resolve, fetchFn, context, cdm } = setup();
    let started;
    const licenseStarted = new Promise((done) => { started = done; });
    fetchFn.mockImplementationOnce((_url, init) => { started(); return new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    }); });
    const pending = expect(resolve(args)).rejects.toMatchObject({ code: 'TASK_CANCELED' });
    await licenseStarted;
    context.controller.abort();
    resolve.dispose();
    await pending;
    expect(cdm.sessions.size).toBe(0);
  });

  it('rejects missing PSSH and a license that omits the requested track key', async () => {
    await expect(setup().resolve({ keyId: kid, psshBoxes: [] })).rejects.toMatchObject({ code: 'PSSH_REQUIRED' });
    await expect(setup().resolve({ ...args, keyId: 'b'.repeat(32) })).rejects.toMatchObject({ code: 'KEY_NOT_IN_LICENSE' });
  });

  it('bounds license responses and distinguishes network timeouts from user cancellation', async () => {
    const first = setup(); first.fetchFn.mockResolvedValueOnce(new Response(new Uint8Array(128 * 1024 + 1)));
    await expect(first.resolve(args)).rejects.toMatchObject({ code: 'LICENSE_TOO_LARGE' });
    expect(first.cdm.sessions.size).toBe(0);
    const second = setup(); second.fetchFn.mockRejectedValueOnce(new DOMException('timeout', 'TimeoutError'));
    await expect(second.resolve(args)).rejects.toMatchObject({ code: 'LICENSE_NETWORK_ERROR' });
    expect(second.cdm.sessions.size).toBe(0);
  });

  it('allows only the expected HTTPS license endpoint', () => {
    expect(isWidevineLicenseUrl(licenseUrl)).toBe(true);
    for (const url of ['http://widevine-dash.ezdrm.com/widevine-php/widevine-foreignkey.php',
      'https://widevine-dash.ezdrm.com.attacker.test/widevine-php/widevine-foreignkey.php',
      'https://user@widevine-dash.ezdrm.com/widevine-php/widevine-foreignkey.php', 'http://127.0.0.1:1/']) {
      expect(isWidevineLicenseUrl(url)).toBe(false);
    }
  });
});
