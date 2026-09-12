import { SourceError } from './errors.js';
import { bytesField, concatBytes, hexBytes, numberField, oneField, parseFields } from './cdm-protobuf.js';
import { deriveLicenseKeys, wrapPrivateKey, wrapPublicKey } from './cdm-crypto.js';

export const MAX_DEVICE_BYTES = 256 * 1024;
const pss = { name: 'RSA-PSS', saltLength: 20 };
const readBytes = (message, id, fallback) => oneField(message, id, 2, fallback);
const readNumber = (message, id, fallback) => oneField(message, id, 0, fallback);

export async function importWvd(source) {
  const bytes = new Uint8Array(source); // Own the buffer so we can erase the imported DER.
  let pkcs8;
  try {
    if (bytes.length < 12 || bytes.length > MAX_DEVICE_BYTES || hexBytes(bytes.subarray(0, 3)) !== '575644') {
      throw new Error('Invalid WVD');
    }
    if (bytes[3] !== 2) throw new SourceError('当前支持 WVD v2 设备文件', 'WVD_VERSION_UNSUPPORTED');
    const type = bytes[4], securityLevel = bytes[5];
    if (![1, 2].includes(type) || securityLevel < 1 || securityLevel > 3 || bytes[6] !== 0) throw new Error('Invalid WVD header');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const privateSize = view.getUint16(7);
    const clientOffset = 9 + privateSize;
    if (privateSize < 128 || clientOffset + 2 > bytes.length) throw new Error('Invalid WVD key');
    const clientSize = view.getUint16(clientOffset);
    if (!clientSize || clientOffset + 2 + clientSize !== bytes.length) throw new Error('Invalid WVD client');
    const clientId = bytes.slice(clientOffset + 2);
    const certificate = parseFields(readBytes(parseFields(readBytes(parseFields(clientId), 2)), 1));
    const publicBytes = readBytes(certificate, 4);
    const systemId = readNumber(certificate, 5);
    if (!Number.isInteger(systemId) || systemId <= 0) throw new Error('Invalid device certificate');
    pkcs8 = wrapPrivateKey(bytes.subarray(9, clientOffset));
    const [signKey, decryptKey, publicKey] = await Promise.all([
      crypto.subtle.importKey('pkcs8', pkcs8, { name: 'RSA-PSS', hash: 'SHA-1' }, false, ['sign']),
      crypto.subtle.importKey('pkcs8', pkcs8, { name: 'RSA-OAEP', hash: 'SHA-1' }, false, ['decrypt']),
      crypto.subtle.importKey('spki', wrapPublicKey(publicBytes), { name: 'RSA-PSS', hash: 'SHA-1' }, false, ['verify']),
    ]);
    if (signKey.algorithm.modulusLength < 2048) throw new Error('Invalid RSA size');
    const proof = crypto.getRandomValues(new Uint8Array(32));
    const signature = await crypto.subtle.sign(pss, signKey, proof);
    if (!await crypto.subtle.verify(pss, publicKey, signature, proof)) throw new Error('Device key mismatch');
    return { schema: 1, type, securityLevel, systemId, clientId, signKey, decryptKey, importedAt: Date.now() };
  } catch (error) {
    if (error instanceof SourceError) throw error;
    throw new SourceError('设备文件无效，或设备私钥与证书不匹配', 'WVD_INVALID');
  } finally { bytes.fill(0); pkcs8?.fill(0); }
}

export class BrowserCdm {
  constructor(device) {
    if (device?.schema !== 1 || !device.signKey || !device.decryptKey || !device.clientId?.length) {
      throw new SourceError('请在 DRM 设置中导入 .wvd 设备文件', 'CDM_NOT_CONFIGURED');
    }
    this.device = device;
    this.sessions = new Set();
    this.sequence = 0;
    this.disposed = false;
  }

  async createChallenge(box) {
    if (this.disposed || this.sessions.size >= 8) throw new SourceError('CDM 会话不可用', 'CDM_SESSION_CLOSED');
    if (!(box.data instanceof Uint8Array) || !box.data.length || box.data.length > 65536) {
      throw new SourceError('Widevine PSSH 初始化数据无效', 'PSSH_REQUIRED');
    }
    let requestId = crypto.getRandomValues(new Uint8Array(16));
    if (this.device.type === 2) {
      requestId.fill(0, 4);
      new DataView(requestId.buffer).setBigUint64(8, BigInt(++this.sequence), true);
      requestId = new TextEncoder().encode(hexBytes(requestId).toUpperCase());
    }
    const psshData = concatBytes(bytesField(1, box.data), numberField(2, 1), bytesField(3, requestId));
    const nonce = (crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fffffff) || 1;
    const request = concatBytes(bytesField(1, this.device.clientId), bytesField(2, bytesField(1, psshData)),
      numberField(3, 1), numberField(4, Math.floor(Date.now() / 1000)), numberField(6, 21), numberField(7, nonce));
    const session = { requestId, request, consumed: false };
    this.sessions.add(session);
    try {
      const signature = new Uint8Array(await crypto.subtle.sign(pss, this.device.signKey, request));
      if (this.disposed) throw new Error('CDM disposed');
      const challenge = concatBytes(numberField(1, 1), bytesField(2, request), bytesField(3, signature));
      return { challenge, parseLicense: (license) => this.parseLicense(session, license),
        close: () => this.closeSession(session) };
    } catch {
      this.closeSession(session);
      throw new SourceError('无法生成设备授权请求', 'CDM_CHALLENGE_FAILED');
    }
  }

  async parseLicense(session, bytes) {
    if (this.disposed || !this.sessions.has(session) || session.consumed) {
      throw new SourceError('授权会话已关闭或许可证已处理', 'CDM_SESSION_CLOSED');
    }
    session.consumed = true;
    let sessionKey, derived;
    const keys = new Map();
    try {
      const signed = parseFields(bytes);
      if (readNumber(signed, 1) !== 2 || readNumber(signed, 8, 1) !== 1) throw new Error('Unsupported license response');
      const message = readBytes(signed, 2), signature = readBytes(signed, 3);
      const license = parseFields(message);
      const responseId = readBytes(parseFields(readBytes(license, 1)), 1);
      if (hexBytes(responseId) !== hexBytes(session.requestId)) throw new Error('License request ID mismatch');
      sessionKey = new Uint8Array(await crypto.subtle.decrypt('RSA-OAEP', this.device.decryptKey, readBytes(signed, 4)));
      if (sessionKey.length !== 16) throw new Error('Invalid session key');
      derived = await deriveLicenseKeys(sessionKey, session.request);
      const macKey = await crypto.subtle.importKey('raw', derived.mac, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
      const authenticated = concatBytes(readBytes(signed, 9, new Uint8Array()), message);
      if (!await crypto.subtle.verify('HMAC', macKey, signature, authenticated)) throw new Error('License signature mismatch');
      const wrappedKeys = license.get(3) || [];
      if (wrappedKeys.length > 128) throw new Error('Too many content keys');
      const aesKey = await crypto.subtle.importKey('raw', derived.enc, 'AES-CBC', false, ['decrypt']);
      for (const wrapped of wrappedKeys) {
        if (wrapped.wire !== 2) throw new Error('Invalid content key container');
        const container = parseFields(wrapped.value);
        if (readNumber(container, 4, 0) !== 2) continue;
        const id = readBytes(container, 1), iv = readBytes(container, 2), ciphertext = readBytes(container, 3);
        if (id.length !== 16 || iv.length !== 16 || ciphertext.length !== 32) throw new Error('Invalid wrapped key');
        const key = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, aesKey, ciphertext));
        if (key.length !== 16) { key.fill(0); throw new Error('Invalid content key size'); }
        keys.set(hexBytes(id), key);
      }
      if (this.disposed || !this.sessions.has(session)) throw new Error('CDM disposed');
      if (!keys.size) throw new SourceError('许可证中没有有效的内容密钥', 'CDM_INVALID_KEYS');
      return keys;
    } catch (error) {
      for (const key of keys.values()) key.fill(0);
      if (error instanceof SourceError) throw error;
      throw new SourceError('许可证校验或解包失败，请重新播放视频后重试', 'CDM_LICENSE_INVALID');
    } finally {
      sessionKey?.fill(0); derived?.enc.fill(0); derived?.mac.fill(0);
      this.closeSession(session);
    }
  }

  closeSession(session) {
    this.sessions.delete(session);
    session.request.fill(0); session.requestId.fill(0);
  }
  dispose() {
    this.disposed = true;
    for (const session of this.sessions) this.closeSession(session);
    this.device = null;
  }
}
