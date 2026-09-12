import { importWvd, MAX_DEVICE_BYTES } from './cdm-browser.js';
import { loadDevice, saveDevice, restoreBundledDevice } from './cdm-device-store.js';

const field = (id) => document.getElementById(id);
const message = (key) => chrome.i18n.getMessage(key);
for (const element of document.querySelectorAll('[data-i18n]')) {
  element.textContent = message(element.dataset.i18n) || element.textContent;
}
for (const element of document.querySelectorAll('[data-i18n-aria]')) {
  element.setAttribute('aria-label', message(element.dataset.i18nAria) || element.getAttribute('aria-label'));
}
document.documentElement.lang = chrome.i18n.getUILanguage?.().replaceAll('_', '-') || 'zh-CN';
document.title = `RPlay · ${message('drmSettings')}`;
let isBusy = false;
function showDevice(device) {
  field('deviceCard').dataset.state = 'ready';
  field('deviceStatus').textContent = message(device.bundled ? 'drmBundledReady' : 'drmDeviceReady');
  field('deviceHint').textContent = message(device.bundled ? 'drmBundledHint' : 'drmCustomHint');
  field('restore').hidden = Boolean(device.bundled);
}
function showStatus(key, kind = 'progress') {
  field('status').dataset.kind = kind;
  field('status').textContent = key ? message(key) : '';
}
function busy(value) {
  isBusy = value;
  field('save').disabled = value || !field('device').files.length;
  field('restore').disabled = value;
  field('device').disabled = value;
  field('settings').setAttribute('aria-busy', String(value));
}
function showSelection() {
  const file = field('device').files[0];
  field('selectedFile').hidden = !file;
  field('fileName').textContent = file?.name || '';
  field('fileSize').textContent = file ? `${(file.size / 1024).toFixed(1)} KB` : '';
  busy(isBusy);
}
busy(true);
loadDevice().then(showDevice).catch(() => {
  field('deviceCard').dataset.state = 'error';
  field('deviceStatus').textContent = message('drmMissingTitle');
  field('deviceHint').textContent = message('drmDeviceMissing');
  field('restore').hidden = false;
}).finally(() => busy(false));

field('device').addEventListener('change', () => {
  showSelection();
  showStatus('');
});
field('settings').addEventListener('submit', async (event) => {
  event.preventDefault();
  const file = field('device').files[0];
  if (!file || isBusy) return;
  busy(true);
  showStatus('drmChecking');
  let bytes;
  try {
    if (file.size > MAX_DEVICE_BYTES) throw new Error('Invalid file size');
    bytes = new Uint8Array(await file.arrayBuffer());
    const device = await importWvd(bytes);
    await saveDevice(device);
    showDevice(device);
    field('device').value = '';
    showSelection();
    showStatus('drmSaved', 'success');
  } catch {
    showStatus('drmInvalidDevice', 'error');
  } finally {
    bytes?.fill(0);
    busy(false);
  }
});
field('restore').addEventListener('click', async () => {
  if (isBusy) return;
  busy(true);
  showStatus('drmRestoring');
  try {
    showDevice(await restoreBundledDevice());
    field('device').value = '';
    showSelection();
    showStatus('drmRestored', 'success');
  } catch {
    showStatus('drmRestoreFailed', 'error');
  } finally { busy(false); }
});
