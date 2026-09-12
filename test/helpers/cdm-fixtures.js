// Ephemeral synthetic identity. This certificate is not provisioned by any DRM
// provider; no user/device credentials are included in tests or test outputs.
import { constants, createCipheriv, createHmac, generateKeyPairSync, publicEncrypt, verify } from 'node:crypto';
import { bytesField as b, concatBytes as cat, numberField as n, oneField, parseFields } from '../../src/cdm-protobuf.js';

const identity = generateKeyPairSync('rsa', { modulusLength: 2048 });
const privateDer = identity.privateKey.export({ type: 'pkcs1', format: 'der' });
const publicDer = identity.publicKey.export({ type: 'pkcs1', format: 'der' });
const client = b(2, b(1, cat(b(4, publicDer), n(5, 1234))));
const length = (size) => { const value = Buffer.alloc(2); value.writeUInt16BE(size); return value; };
export const syntheticKeys = {
  '00112233445566778899aabbccddeeff': '000102030405060708090a0b0c0d0e0f',
  'ffeeddccbbaa99887766554433221100': '101112131415161718191a1b1c1d1e1f',
};
export function syntheticWvd(type = 2) {
  return cat(new Uint8Array([87, 86, 68, 2, type, 3, 0]), length(privateDer.length), privateDer, length(client.length), client);
}
const byteField = (fields, id) => oneField(fields, id, 2);
export function readChallenge(challenge) {
  const signed = parseFields(challenge);
  const request = byteField(signed, 2);
  if (!verify('sha1', request, { key: identity.publicKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 20 }, byteField(signed, 3))) {
    throw new Error('Invalid synthetic request signature');
  }
  const fields = parseFields(request);
  const pssh = parseFields(byteField(parseFields(byteField(fields, 2)), 1));
  return { request, fields, requestId: byteField(pssh, 3), initData: byteField(pssh, 1) };
}

// Independent Node/OpenSSL ECB implementation used by the simulated license
// server; production uses Web Crypto CBC and RFC 4493 test vectors.
function cmac(key, message) {
  const encrypt = (value) => {
    const cipher = createCipheriv('aes-128-ecb', key, null); cipher.setAutoPadding(false);
    return Buffer.concat([cipher.update(value), cipher.final()]);
  };
  const shift = (value) => {
    const result = Buffer.alloc(16);
    for (let i = 15, carry = 0; i >= 0; i--) { result[i] = (value[i] << 1) | carry; carry = value[i] >> 7; }
    if (value[0] & 128) result[15] ^= 135;
    return result;
  };
  const complete = message.length > 0 && message.length % 16 === 0;
  const first = shift(encrypt(Buffer.alloc(16))), subkey = complete ? first : shift(first);
  const input = Buffer.alloc(Math.max(1, Math.ceil(message.length / 16)) * 16); input.set(message);
  if (!complete) input[message.length] = 128;
  for (let i = 0; i < 16; i++) input[input.length - 16 + i] ^= subkey[i];
  let state = Buffer.alloc(16);
  for (let offset = 0; offset < input.length; offset += 16) {
    for (let i = 0; i < 16; i++) state[i] ^= input[offset + i];
    state = encrypt(state);
  }
  return state;
}

export function syntheticLicense(challenge, { keys = syntheticKeys, requestId, badSignature = false, core = new Uint8Array([7, 8, 9]) } = {}) {
  const decoded = readChallenge(challenge);
  const sessionKey = Buffer.alloc(16, 0x75);
  const enc = cmac(sessionKey, cat(new Uint8Array([1]), Buffer.from('ENCRYPTION\0'), decoded.request, new Uint8Array([0, 0, 0, 128])));
  const macContext = cat(Buffer.from('AUTHENTICATION\0'), decoded.request, new Uint8Array([0, 0, 2, 0]));
  const mac = cat(cmac(sessionKey, cat(new Uint8Array([1]), macContext)), cmac(sessionKey, cat(new Uint8Array([2]), macContext)));
  const containers = Object.entries(keys).map(([id, key]) => {
    const iv = Buffer.alloc(16, 0x31);
    const cipher = createCipheriv('aes-128-cbc', enc, iv);
    const encrypted = Buffer.concat([cipher.update(Buffer.from(key, 'hex')), cipher.final()]);
    return b(3, cat(b(1, Buffer.from(id, 'hex')), b(2, iv), b(3, encrypted), n(4, 2)));
  });
  const message = cat(b(1, b(1, requestId || decoded.requestId)), ...containers, b(99, new Uint8Array([42])));
  const signature = createHmac('sha256', mac).update(core).update(message).digest();
  if (badSignature) signature[0] ^= 1;
  const wrappedSession = publicEncrypt({ key: identity.publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha1' }, sessionKey);
  return cat(n(1, 2), b(2, message), b(3, signature), b(4, wrappedSession), n(8, 1), b(9, core));
}
