import { SourceError, UnsupportedFallbackError } from './errors.js';

export function resolveUrl(value, baseUrl) {
  if (!value) return null;
  try {
    return new URL(value, baseUrl).href;
  } catch {
    return value;
  }
}

export function parseAttributeList(value) {
  const attributes = {};
  let index = 0;

  while (index < value.length) {
    while (value[index] === ',' || /\s/.test(value[index] || '')) index++;
    const keyStart = index;
    while (index < value.length && value[index] !== '=') index++;
    if (index >= value.length) break;

    const key = value.slice(keyStart, index).trim().toUpperCase();
    index++;
    let parsedValue = '';

    if (value[index] === '"') {
      index++;
      const valueStart = index;
      while (index < value.length && value[index] !== '"') index++;
      parsedValue = value.slice(valueStart, index);
      index++;
    } else {
      const valueStart = index;
      while (index < value.length && value[index] !== ',') index++;
      parsedValue = value.slice(valueStart, index).trim();
    }

    if (key) attributes[key] = parsedValue;
    while (index < value.length && value[index] !== ',') index++;
    if (value[index] === ',') index++;
  }

  return attributes;
}

export function parseMasterPlaylist(content, baseUrl) {
  const lines = content.split(/\r?\n/).map((line) => line.trim());
  const audioGroups = new Map();
  const sessionKeys = [];

  for (const line of lines) {
    if (line.startsWith('#EXT-X-SESSION-KEY:')) {
      const attributes = parseAttributeList(line.slice(line.indexOf(':') + 1));
      sessionKeys.push({
        method: (attributes.METHOD || '').toUpperCase(),
        uri: resolveUrl(attributes.URI, baseUrl),
        iv: attributes.IV || null,
        keyFormat: attributes.KEYFORMAT || 'identity',
      });
      continue;
    }
    if (!line.startsWith('#EXT-X-MEDIA:')) continue;
    const attributes = parseAttributeList(line.slice(line.indexOf(':') + 1));
    if (attributes.TYPE !== 'AUDIO' || !attributes['GROUP-ID']) continue;
    const group = audioGroups.get(attributes['GROUP-ID']) || [];
    group.push({
      uri: resolveUrl(attributes.URI, baseUrl),
      language: attributes.LANGUAGE || null,
      name: attributes.NAME || null,
      isDefault: attributes.DEFAULT === 'YES',
    });
    audioGroups.set(attributes['GROUP-ID'], group);
  }

  const streams = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!line.startsWith('#EXT-X-STREAM-INF:')) continue;
    const attributes = parseAttributeList(line.slice(line.indexOf(':') + 1));
    let uri = null;
    for (let next = index + 1; next < lines.length; next++) {
      if (!lines[next]) continue;
      if (!lines[next].startsWith('#')) uri = lines[next];
      break;
    }
    if (!uri) continue;

    const resolution = attributes.RESOLUTION || null;
    const [width, height] = resolution
      ? resolution.split('x').map((item) => Number.parseInt(item, 10))
      : [null, null];
    const audioGroup = attributes.AUDIO || null;
    const externalAudioTracks = audioGroup
      ? (audioGroups.get(audioGroup) || []).filter((track) => Boolean(track.uri))
      : [];
    const preferredAudio = externalAudioTracks.find((track) => track.isDefault) || externalAudioTracks[0] || null;

    streams.push({
      url: resolveUrl(uri, baseUrl),
      resolution,
      width,
      height,
      bandwidth: Number.parseInt(attributes.BANDWIDTH || attributes['AVERAGE-BANDWIDTH'] || '0', 10) || null,
      averageBandwidth: Number.parseInt(attributes['AVERAGE-BANDWIDTH'] || '0', 10) || null,
      codecs: attributes.CODECS || null,
      audioGroup,
      hasExternalAudio: externalAudioTracks.length > 0,
      audioUrl: preferredAudio?.uri || null,
    });
  }

  return { streams, audioGroups, sessionKeys };
}

export function getPlaylistDuration(content) {
  let duration = 0;
  for (const match of content.matchAll(/#EXTINF:([\d.]+)/g)) {
    duration += Number.parseFloat(match[1]);
  }
  return Number.isFinite(duration) && duration > 0 ? duration : null;
}

export function getUnsupportedHlsEncryption(content) {
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!/^#EXT-X-(?:SESSION-)?KEY:/.test(line)) continue;
    const attributes = parseAttributeList(line.slice(line.indexOf(':') + 1));
    const method = (attributes.METHOD || '').toUpperCase();
    if (method === 'NONE') continue;
    if (method !== 'AES-128' || (attributes.KEYFORMAT && attributes.KEYFORMAT !== 'identity')) {
      return { method: method || 'UNKNOWN', keyFormat: attributes.KEYFORMAT || 'identity' };
    }
  }
  return null;
}

export function getPrefetchableSegmentUrls(content, playlistUrl) {
  const lines = content.split(/\r?\n/).map((line) => line.trim());
  if (!lines.includes('#EXT-X-ENDLIST')) return [];
  if (lines.some((line) => line.startsWith('#EXT-X-BYTERANGE:'))) return [];

  const urls = [];
  let expectsSegment = false;
  for (const line of lines) {
    if (!line) continue;
    if (line.startsWith('#EXTINF:')) {
      expectsSegment = true;
      continue;
    }
    if (line.startsWith('#')) continue;
    if (!expectsSegment) continue;
    const url = resolveUrl(line, playlistUrl);
    if (url) urls.push(url);
    expectsSegment = false;
  }
  return urls;
}

export function resolveOutputRotation(
  requestedWidth,
  requestedHeight,
  codedWidth,
  codedHeight,
  inputRotation,
) {
  if (![90, 270].includes(inputRotation)) return inputRotation || 0;
  if (![requestedWidth, requestedHeight, codedWidth, codedHeight].every((value) => value > 0)) {
    return inputRotation;
  }

  const targetAspect = requestedWidth / requestedHeight;
  const unrotatedAspect = codedWidth / codedHeight;
  const rotatedAspect = codedHeight / codedWidth;
  const unrotatedDistance = Math.abs(Math.log(unrotatedAspect / targetAspect));
  const rotatedDistance = Math.abs(Math.log(rotatedAspect / targetAspect));

  // Some HLS TS/fMP4 tracks expose a stale 90° matrix even though both the
  // master playlist and coded frames already use the intended orientation.
  return unrotatedDistance + 0.01 < rotatedDistance ? 0 : inputRotation;
}

export function parseMediaPlaylist(content, playlistUrl, defaultKey = null) {
  const lines = content.split(/\r?\n/).map((line) => line.trim());
  const sequenceLine = lines.find((line) => line.startsWith('#EXT-X-MEDIA-SEQUENCE:'));
  const mediaSequence = sequenceLine
    ? Number.parseInt(sequenceLine.slice(sequenceLine.indexOf(':') + 1), 10)
    : 0;
  const hasEndList = lines.includes('#EXT-X-ENDLIST');
  const hasMediaKey = lines.some((line) => line.startsWith('#EXT-X-KEY:'));
  let activeKey = hasMediaKey || !defaultKey ? null : { ...defaultKey };
  let pendingDuration = null;
  let sawMap = false;
  let sawByteRange = false;
  const segments = [];

  for (const line of lines) {
    if (!line) continue;
    if (line.startsWith('#EXT-X-MAP:')) {
      sawMap = true;
      continue;
    }
    if (line.startsWith('#EXT-X-BYTERANGE:')) {
      sawByteRange = true;
      continue;
    }
    if (line.startsWith('#EXTINF:')) {
      pendingDuration = Number.parseFloat(line.slice(8).split(',')[0]);
      continue;
    }
    if (line.startsWith('#EXT-X-KEY:')) {
      const attributes = parseAttributeList(line.slice(line.indexOf(':') + 1));
      const method = (attributes.METHOD || '').toUpperCase();
      if (method === 'NONE') {
        activeKey = null;
        continue;
      }
      if (method !== 'AES-128') {
        throw new UnsupportedFallbackError(`TS 回退不支持加密方式 ${method || 'UNKNOWN'}`, 'UNSUPPORTED_ENCRYPTION');
      }
      if (attributes.KEYFORMAT && attributes.KEYFORMAT !== 'identity') {
        throw new UnsupportedFallbackError('TS 回退不支持 DRM/非 identity KEYFORMAT', 'DRM_UNSUPPORTED');
      }
      if (!attributes.URI) {
        throw new SourceError('AES-128 密钥缺少 URI', 'INVALID_KEY');
      }
      activeKey = {
        method,
        uri: resolveUrl(attributes.URI, playlistUrl),
        iv: attributes.IV || null,
      };
      continue;
    }
    if (line.startsWith('#')) continue;

    segments.push({
      url: resolveUrl(line, playlistUrl),
      sequence: mediaSequence + segments.length,
      duration: Number.isFinite(pendingDuration) ? pendingDuration : null,
      key: activeKey ? { ...activeKey } : null,
    });
    pendingDuration = null;
  }

  if (sawMap) {
    throw new UnsupportedFallbackError('TS 回退不支持 fMP4/CMAF 播放列表', 'FMP4_FALLBACK_UNSUPPORTED');
  }
  if (sawByteRange) {
    throw new UnsupportedFallbackError('TS 回退暂不支持 EXT-X-BYTERANGE', 'BYTERANGE_UNSUPPORTED');
  }
  if (!hasEndList) {
    throw new UnsupportedFallbackError('当前版本只支持 VOD/回放，不支持持续直播录制', 'LIVE_UNSUPPORTED');
  }
  if (segments.length === 0) {
    throw new SourceError('媒体播放列表中没有可下载的片段', 'EMPTY_PLAYLIST');
  }

  return { mediaSequence, segments, hasEndList };
}

export function parseIv(ivValue) {
  const normalized = String(ivValue || '').replace(/^0x/i, '');
  if (!/^[0-9a-f]+$/i.test(normalized) || normalized.length > 32) {
    throw new SourceError('HLS IV 格式无效', 'INVALID_IV');
  }
  const padded = normalized.padStart(32, '0');
  return Uint8Array.from(padded.match(/.{2}/g), (byte) => Number.parseInt(byte, 16));
}

export function generateSequenceIv(sequence) {
  let value = BigInt(sequence);
  const iv = new Uint8Array(16);
  for (let index = 15; index >= 0 && value > 0n; index--) {
    iv[index] = Number(value & 0xffn);
    value >>= 8n;
  }
  return iv;
}

export async function decryptAes128(data, cryptoKey, iv) {
  return crypto.subtle.decrypt({ name: 'AES-CBC', iv }, cryptoKey, data);
}

export function looksLikeTransportStream(data) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes.length < 188) return false;
  for (let offset = 0; offset < Math.min(376, bytes.length); offset++) {
    if (bytes[offset] !== 0x47) continue;
    if (offset + 188 >= bytes.length || bytes[offset + 188] === 0x47) return true;
  }
  return false;
}

export async function processInOrderedBatches(items, concurrency, loader, writer) {
  const limit = Math.max(1, Math.floor(concurrency));
  const inFlight = new Map();
  let nextLoad = 0;

  const fill = () => {
    while (nextLoad < items.length && inFlight.size < limit) {
      const index = nextLoad++;
      const promise = Promise.resolve().then(() => loader(items[index], index));
      void promise.catch(() => {});
      inFlight.set(index, promise);
    }
  };

  fill();
  for (let index = 0; index < items.length; index++) {
    const loaded = await inFlight.get(index);
    inFlight.delete(index);
    fill();
    await writer(loaded, items[index], index);
  }
}
