const ESTIMATED_PAYLOAD_RATIO = 0.68;

export function estimateMediaBytes(bandwidth, duration) {
  const bitsPerSecond = Number(bandwidth);
  const seconds = Number(duration);
  if (!(bitsPerSecond > 0) || !(seconds > 0)) return null;
  return Math.round((bitsPerSecond * seconds * ESTIMATED_PAYLOAD_RATIO) / 8);
}

// Stable, non-cryptographic fingerprint. It keeps signed media URLs out of the
// public task object while remaining stable across popup re-renders/navigation.
export function createSourceId(masterUrl, streamUrl) {
  const value = `${masterUrl || ''}\n${streamUrl || ''}`;
  let first = 0xdeadbeef ^ value.length;
  let second = 0x41c6ce57 ^ value.length;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 2654435761);
    second = Math.imul(second ^ code, 1597334677);
  }
  first = Math.imul(first ^ (first >>> 16), 2246822507)
    ^ Math.imul(second ^ (second >>> 13), 3266489909);
  second = Math.imul(second ^ (second >>> 16), 2246822507)
    ^ Math.imul(first ^ (first >>> 13), 3266489909);
  return `${(second >>> 0).toString(36)}${(first >>> 0).toString(36)}`;
}
