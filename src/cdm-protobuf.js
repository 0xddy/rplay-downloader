// Bounded protobuf wire codec. Unknown fields are preserved/skipped by wire type;
// signed payloads are verified as their original bytes, never reserialized.
export const concatBytes = (...parts) => {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
};
export const hexBytes = (bytes) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

function varint(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid protobuf integer');
  const bytes = [];
  do { bytes.push((value % 128) | (value >= 128 ? 128 : 0)); value = Math.floor(value / 128); } while (value);
  return new Uint8Array(bytes);
}
export const numberField = (id, value) => concatBytes(varint(id * 8), varint(value));
export const bytesField = (id, value) => concatBytes(varint(id * 8 + 2), varint(value.length), value);

export function parseFields(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length > 512 * 1024) throw new Error('Invalid protobuf size');
  const fields = new Map();
  let offset = 0, count = 0;
  const readInteger = () => {
    let value = 0n;
    for (let index = 0; index < 10; index++) {
      if (offset >= bytes.length) throw new Error('Truncated protobuf');
      const byte = bytes[offset++];
      if (index === 9 && byte > 1) throw new Error('Invalid protobuf integer');
      value |= BigInt(byte & 127) << BigInt(index * 7);
      if (!(byte & 128)) return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value;
    }
    throw new Error('Invalid protobuf varint');
  };
  while (offset < bytes.length) {
    if (++count > 8192) throw new Error('Too many protobuf fields');
    const tag = readInteger();
    if (typeof tag !== 'number' || tag < 8 || tag > 0xffffffff) throw new Error('Invalid protobuf tag');
    const id = Math.floor(tag / 8), wire = tag % 8;
    let value;
    if (wire === 0) value = readInteger();
    else {
      const length = wire === 1 ? 8 : wire === 5 ? 4 : wire === 2 ? readInteger() : -1;
      if (typeof length !== 'number' || length < 0 || length > bytes.length - offset) throw new Error('Invalid protobuf length');
      value = bytes.subarray(offset, offset + length); offset += length;
    }
    if (!fields.has(id)) fields.set(id, []);
    fields.get(id).push({ wire, value });
  }
  return fields;
}

export function oneField(fields, id, wire, fallback) {
  const entries = fields.get(id);
  if (!entries) {
    if (fallback !== undefined) return fallback;
    throw new Error('Missing protobuf field');
  }
  if (entries.length !== 1 || entries[0].wire !== wire) throw new Error('Ambiguous protobuf field');
  return entries[0].value;
}
