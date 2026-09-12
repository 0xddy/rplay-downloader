import { SourceError } from './errors.js';
import { importWvd, MAX_DEVICE_BYTES } from './cdm-browser.js';

// CryptoKey structured cloning retains extractable:false. The raw .wvd and
// its private DER are never stored in chrome.storage, task messages or logs.
async function deviceTransaction(mode, action) {
  const database = await new Promise((resolve, reject) => {
    const request = indexedDB.open('rplay-cdm', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('devices');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Database blocked'));
  });
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction('devices', mode);
      const request = action(transaction.objectStore('devices'));
      transaction.oncomplete = () => resolve(request.result ?? null);
      transaction.onerror = transaction.onabort = () => reject(transaction.error);
    });
  } finally { database.close(); }
}
export async function loadDevice() {
  let device;
  try { device = await deviceTransaction('readonly', (store) => store.get('active')); }
  catch { throw new SourceError('无法读取 DRM 设备，请重新导入', 'CDM_STORAGE_ERROR'); }
  if (device) return device;
  const bundled = await readBundledDevice();
  // A custom device may have been imported while the bundled file was loading.
  // Only seed an empty store; explicit restore is allowed to replace it.
  const existing = await deviceTransaction('readwrite', (store) => {
    const request = store.get('active');
    request.onsuccess = () => { if (!request.result) store.put(bundled, 'active'); };
    return request;
  });
  return existing || bundled;
}
export async function saveDevice(device) {
  try { await deviceTransaction('readwrite', (store) => store.put(device, 'active')); }
  catch { throw new SourceError('设备保存失败，请检查浏览器本地存储', 'CDM_STORAGE_ERROR'); }
}
async function readBundledDevice() {
  let response;
  try { response = await fetch(chrome.runtime.getURL('private/device.wvd')); }
  catch { throw new SourceError('未找到内置设备，请导入 .wvd 文件', 'CDM_NOT_CONFIGURED'); }
  if (!response.ok) throw new SourceError('未找到内置设备，请导入 .wvd 文件', 'CDM_NOT_CONFIGURED');
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_DEVICE_BYTES) throw new SourceError('设备文件过大', 'WVD_INVALID');
  return { ...await importWvd(buffer), bundled: true };
}

export async function restoreBundledDevice() {
  const device = await readBundledDevice();
  await saveDevice(device);
  return device;
}
