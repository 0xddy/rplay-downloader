import { SourceError, TaskCanceledError } from './errors.js';
import { BrowserCdm } from './cdm-browser.js';
import { loadDevice } from './cdm-device-store.js';

export const LICENSE_STORAGE_PREFIX = 'rplayWidevine:';
const WIDEVINE_SYSTEM_ID = 'edef8ba979d64acea3c827dcd51d21ed';

export function isWidevineLicenseUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password
      && url.hostname === 'widevine-dash.ezdrm.com' && !url.port
      && url.pathname === '/widevine-php/widevine-foreignkey.php';
  } catch {
    return false;
  }
}

function toBase64(bytes) {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
}

async function readBounded(response, limit) {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel();
        throw new SourceError('授权响应超出大小限制', 'LICENSE_TOO_LARGE');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

export function createCdmKeyResolver(task, context, {
  fetchFn = globalThis.fetch,
  createCdm = async () => new BrowserCdm(await loadDevice()),
} = {}) {
  const keys = new Map();
  const pending = new Map();
  let cdmPromise;
  let cdm;
  let disposed = false;

  const checkCanceled = () => {
    if (disposed || context.controller.signal.aborted) throw new TaskCanceledError();
  };
  async function authorize(box) {
    checkCanceled();
    if (!isWidevineLicenseUrl(task.licenseUrl)) {
      throw new SourceError('尚未捕获 Widevine 授权请求，请刷新视频页面并开始播放后重试', 'LICENSE_URL_REQUIRED');
    }
    cdmPromise ||= Promise.resolve().then(createCdm).then((instance) => {
      if (disposed) { instance.dispose(); throw new TaskCanceledError(); }
      cdm = instance;
      return instance;
    });
    const instance = await cdmPromise;
    checkCanceled();
    const session = await instance.createChallenge(box);
    try {
      checkCanceled();
      let license;
      try {
        license = await fetchFn(task.licenseUrl, {
          method: 'POST', headers: { 'Content-Type': 'application/octet-stream' },
          body: session.challenge, credentials: 'omit', redirect: 'error',
          signal: AbortSignal.any([context.controller.signal, AbortSignal.timeout(20000)]),
        });
      } catch (error) {
        if (context.controller.signal.aborted) throw new TaskCanceledError();
        throw new SourceError('Widevine 授权请求失败，请检查网络或重新播放视频', 'LICENSE_NETWORK_ERROR');
      }
      if (!license.ok) {
        throw new SourceError(`Widevine 授权失败（HTTP ${license.status}），请检查账号权限或设备状态`, 'LICENSE_REJECTED');
      }
      let bytes;
      try {
        bytes = await readBounded(license, 128 * 1024);
      } catch (error) {
        if (context.controller.signal.aborted) throw new TaskCanceledError();
        if (error instanceof SourceError) throw error;
        throw new SourceError('许可证读取失败，请重试下载', 'LICENSE_NETWORK_ERROR');
      }
      const result = await session.parseLicense(bytes);
      if (disposed || context.controller.signal.aborted) {
        for (const key of result.values()) key.fill(0);
        throw new TaskCanceledError();
      }
      for (const [kid, key] of result) {
        keys.get(kid)?.fill(0);
        keys.set(kid, key);
      }
    } finally {
      session.close();
      session.challenge.fill(0);
    }
  }

  const resolveKeyId = async ({ keyId, psshBoxes }) => {
    checkCanceled();
    const normalizedId = keyId.toLowerCase();
    if (!keys.has(normalizedId)) {
      const box = psshBoxes.find((entry) => entry.systemId === WIDEVINE_SYSTEM_ID
        && (!entry.keyIds?.length || entry.keyIds.includes(normalizedId)));
      if (!box) throw new SourceError('媒体缺少对应的 Widevine PSSH 初始化信息', 'PSSH_REQUIRED');
      const identity = `${toBase64(box.data)}:${(box.keyIds || []).join(',')}`;
      if (!pending.has(identity)) pending.set(identity, authorize(box));
      try { await pending.get(identity); }
      catch (error) { checkCanceled(); throw error; }
    }
    checkCanceled();
    const key = keys.get(normalizedId);
    if (!key) throw new SourceError('许可证中没有所选音视频轨道的内容密钥', 'KEY_NOT_IN_LICENSE');
    return key.slice();
  };
  resolveKeyId.dispose = () => {
    disposed = true;
    for (const key of keys.values()) key.fill(0);
    keys.clear(); pending.clear(); cdm?.dispose(); cdm = null;
  };
  return resolveKeyId;
}
