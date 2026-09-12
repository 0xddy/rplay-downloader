import { describe, expect, it } from 'vitest';
import { BrowserCdm, importWvd } from '../src/cdm-browser.js';
import { aesCmac } from '../src/cdm-crypto.js';
import { hexBytes, oneField, parseFields } from '../src/cdm-protobuf.js';
import { readChallenge, syntheticKeys, syntheticLicense, syntheticWvd } from './helpers/cdm-fixtures.js';

const data = Uint8Array.from([18, 16, ...new Uint8Array(16)]);
describe('browser CDM', () => {
  it.each([
    ['', 'bb1d6929e95937287fa37d129b756746'],
    ['6bc1bee22e409f96e93d7e117393172a', '070a16b46b4d4144f79bdd9dd04a287c'],
    ['6bc1bee22e409f96e93d7e117393172aae2d8a571e03ac9c9eb76fac45af8e5130c81c46a35ce411', 'dfa66747de9ae63030ca32611497c827'],
    ['6bc1bee22e409f96e93d7e117393172aae2d8a571e03ac9c9eb76fac45af8e5130c81c46a35ce411e5fbc1191a0a52eff69f2445df4f9b17ad2b417be66c3710', '51f0bebf7e3b9d92fc49741779363cfe'],
  ])('matches RFC 4493 AES-CMAC vectors (%s)', async (input, expected) => {
    expect(hexBytes(await aesCmac(Buffer.from('2b7e151628aed2a6abf7158809cf4f3c', 'hex'), Buffer.from(input, 'hex')))).toBe(expected);
  });

  it.each([1, 2])('imports a type %s device, signs requests and unwraps authenticated licenses', async (type) => {
    const device = await importWvd(syntheticWvd(type));
    expect(device.signKey.extractable).toBe(false);
    expect(device.decryptKey.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('pkcs8', device.signKey)).rejects.toThrow();
    const cdm = new BrowserCdm(device);
    const session = await cdm.createChallenge({ data });
    const decoded = readChallenge(session.challenge);
    expect(decoded.requestId.length).toBe(type === 2 ? 32 : 16);
    expect(decoded.initData).toEqual(data);
    expect(oneField(decoded.fields, 6, 0)).toBe(21);
    const license = syntheticLicense(session.challenge);
    const keys = await session.parseLicense(license);
    expect(Object.fromEntries([...keys].map(([id, key]) => [id, hexBytes(key)]))).toEqual(syntheticKeys);
    await expect(session.parseLicense(license)).rejects.toMatchObject({ code: 'CDM_SESSION_CLOSED' });
    cdm.dispose();
  });

  it('rejects altered signatures and request IDs without returning keys', async () => {
    const cdm = new BrowserCdm(await importWvd(syntheticWvd()));
    for (const options of [{ badSignature: true }, { requestId: new Uint8Array(32) }]) {
      const session = await cdm.createChallenge({ data });
      await expect(session.parseLicense(syntheticLicense(session.challenge, options))).rejects.toMatchObject({ code: 'CDM_LICENSE_INVALID' });
      expect(cdm.sessions.size).toBe(0);
    }
    cdm.dispose();
  });

  it('rejects malformed WVD files and mismatched device keys', async () => {
    const wvd = syntheticWvd();
    await expect(importWvd(wvd.subarray(0, wvd.length - 1))).rejects.toMatchObject({ code: 'WVD_INVALID' });
    const old = wvd.slice(); old[3] = 1;
    await expect(importWvd(old)).rejects.toMatchObject({ code: 'WVD_VERSION_UNSUPPORTED' });
    const corrupt = wvd.slice(); corrupt[100] ^= 16;
    await expect(importWvd(corrupt)).rejects.toMatchObject({ code: 'WVD_INVALID' });
  });

  it('closes all pending authorization sessions on disposal', async () => {
    const cdm = new BrowserCdm(await importWvd(syntheticWvd()));
    const session = await cdm.createChallenge({ data });
    const license = syntheticLicense(session.challenge);
    cdm.dispose();
    expect(cdm.sessions.size).toBe(0);
    await expect(session.parseLicense(license)).rejects.toMatchObject({ code: 'CDM_SESSION_CLOSED' });
  });

  it.each([[0], [10, 255], [15], [8, ...new Array(11).fill(255)]].map((bytes) => ({ bytes })))('bounds malformed protobuf messages ($bytes)', ({ bytes }) => {
    expect(() => parseFields(new Uint8Array(bytes))).toThrow();
  });
});
