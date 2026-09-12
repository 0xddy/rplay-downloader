import { importWvd, MAX_DEVICE_BYTES } from './cdm-browser.js';
import { loadDevice, saveDevice, restoreBundledDevice } from './cdm-device-store.js';

const field = (id) => document.getElementById(id);
const message = (key) => chrome.i18n.getMessage(key);
for (const element of document.querySelectorAll('[data-i18n]')) {
  element.textContent = message(element.dataset.i18n) || element.textContent;
}
document.title = `RPlay · ${message('drmSettings')}`;
function showDevice(device) {
  field('deviceStatus').textContent = `${message(device.bundled ? 'drmBundledReady' : 'drmDeviceReady')} · ${device.type === 2 ? 'Android' : 'Chrome'} L${device.securityLevel}`;
}
function busy(value) { field('save').disabled = value; field('restore').disabled = value; }
busy(true);
loadDevice().then(showDevice).catch(() => {
  field('deviceStatus').textContent = message('drmDeviceMissing');
}).finally(() => busy(false));

field('settings').addEventListener('submit', async (event) => {
  event.preventDefault();
  const file = field('device').files[0];
  if (!file) return;
  busy(true);
  field('status').textContent = message('drmChecking');
  let bytes;
  try {
    if (file.size > MAX_DEVICE_BYTES) throw new Error('Invalid file size');
    bytes = new Uint8Array(await file.arrayBuffer());
    const device = await importWvd(bytes);
    await saveDevice(device);
    showDevice(device);
    field('device').value = '';
    field('status').textContent = message('drmSaved');
  } catch {
    field('status').textContent = message('drmInvalidDevice');
  } finally {
    bytes?.fill(0);
    busy(false);
  }
});
field('restore').addEventListener('click', async () => {
  busy(true);
  try {
    showDevice(await restoreBundledDevice());
    field('status').textContent = message('drmSaved');
  } catch {
    field('status').textContent = message('drmDeviceMissing');
  } finally { busy(false); }
});
