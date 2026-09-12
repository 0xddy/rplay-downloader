import { concatBytes } from './cdm-protobuf.js';

const zeroBlock = new Uint8Array(16);
function doubled(block) {
  const result = new Uint8Array(16);
  for (let index = 0; index < 16; index++) result[index] = (block[index] << 1) | ((block[index + 1] || 0) >> 7);
  if (block[0] & 128) result[15] ^= 0x87;
  return result;
}

// RFC 4493: Web Crypto applies PKCS#7 padding to CBC encryption. Only the
// unpadded prefix is used here to compute AES blocks and the final CBC-MAC.
export async function aesCmac(rawKey, message) {
  const key = await crypto.subtle.importKey('raw', rawKey, 'AES-CBC', false, ['encrypt']);
  const l = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CBC', iv: zeroBlock }, key, zeroBlock)).slice(0, 16);
  const complete = message.length > 0 && message.length % 16 === 0;
  const subkey = complete ? doubled(l) : doubled(doubled(l));
  const blocks = Math.max(1, Math.ceil(message.length / 16));
  const prepared = new Uint8Array(blocks * 16); prepared.set(message);
  if (!complete) prepared[message.length] = 0x80;
  for (let index = 0; index < 16; index++) prepared[prepared.length - 16 + index] ^= subkey[index];
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CBC', iv: zeroBlock }, key, prepared));
  const mac = encrypted.slice(prepared.length - 16, prepared.length);
  l.fill(0); subkey.fill(0); prepared.fill(0); encrypted.fill(0);
  return mac;
}

export async function deriveLicenseKeys(sessionKey, request) {
  const text = new TextEncoder();
  const encryption = concatBytes(text.encode('ENCRYPTION\0'), request, new Uint8Array([0, 0, 0, 128]));
  const authentication = concatBytes(text.encode('AUTHENTICATION\0'), request, new Uint8Array([0, 0, 2, 0]));
  const [enc, mac1, mac2] = await Promise.all([
    aesCmac(sessionKey, concatBytes(new Uint8Array([1]), encryption)),
    aesCmac(sessionKey, concatBytes(new Uint8Array([1]), authentication)),
    aesCmac(sessionKey, concatBytes(new Uint8Array([2]), authentication)),
  ]);
  const mac = concatBytes(mac1, mac2); mac1.fill(0); mac2.fill(0);
  return { enc, mac };
}

function der(tag, value) {
  const length = [];
  if (value.length < 128) length.push(value.length);
  else {
    let remaining = value.length;
    while (remaining) { length.unshift(remaining % 256); remaining = Math.floor(remaining / 256); }
    length.unshift(128 | length.length);
  }
  return concatBytes(new Uint8Array([tag, ...length]), value);
}
const rsaAlgorithm = new Uint8Array([0x30, 13, 6, 9, 42, 134, 72, 134, 247, 13, 1, 1, 1, 5, 0]);
export const wrapPrivateKey = (pkcs1) => der(0x30, concatBytes(new Uint8Array([2, 1, 0]), rsaAlgorithm, der(4, pkcs1)));
export const wrapPublicKey = (pkcs1) => der(0x30, concatBytes(rsaAlgorithm, der(3, concatBytes(new Uint8Array([0]), pkcs1))));
