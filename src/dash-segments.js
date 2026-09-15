const MAX_TRACK_SEGMENTS = 10000;
const MAX_TEMPLATE_PADDING = 16;
const MAX_URL_CHARACTERS = 8192;
const DEFAULT_URL_CHARACTER_LIMIT = 4 * 1024 * 1024;

function unsignedInteger(value, fallback = null) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function templateUrl(template, base, values) {
  if (typeof template !== 'string' || !template.trim()) return null;
  let result = '';
  let cursor = 0;
  while (cursor < template.length) {
    const opening = template.indexOf('$', cursor);
    if (opening < 0) {
      result += template.slice(cursor);
      break;
    }
    result += template.slice(cursor, opening);
    if (template[opening + 1] === '$') {
      result += '$';
      cursor = opening + 2;
      continue;
    }
    const closing = template.indexOf('$', opening + 1);
    if (closing < 0) return null;
    const token = template.slice(opening + 1, closing);
    const match = /^(RepresentationID|Number|Bandwidth|Time)(?:%0([1-9]\d?)d)?$/.exec(token);
    if (!match || (match[1] === 'RepresentationID' && match[2])) return null;
    const value = values[match[1]];
    const padding = Number(match[2] || 0);
    if (value === null || value === undefined || padding > MAX_TEMPLATE_PADDING) return null;
    if (match[1] !== 'RepresentationID' && (!Number.isSafeInteger(value) || value < 0)) return null;
    result += String(value).padStart(padding, '0');
    cursor = closing + 1;
  }
  if (result.length > MAX_URL_CHARACTERS) return null;
  try {
    const url = new URL(result.trim(), base);
    return ['http:', 'https:'].includes(url.protocol) && url.href.length <= MAX_URL_CHARACTERS ? url.href : null;
  } catch {
    return null;
  }
}

/** Expand only a finite, continuous, zero-based VOD SegmentTimeline. */
export function expandDashSegmentTemplate(template, base, representation, segmentLimit = MAX_TRACK_SEGMENTS,
  urlCharacterLimit = DEFAULT_URL_CHARACTER_LIMIT) {
  if (!template || typeof template !== 'object' || Array.isArray(template)) return null;
  const timescale = unsignedInteger(template['@_timescale'], 1);
  const startNumber = unsignedInteger(template['@_startNumber'], 1);
  const offset = unsignedInteger(template['@_presentationTimeOffset'], 0);
  const timeline = template.SegmentTimeline;
  if (!timescale || startNumber === null || offset !== 0 || !timeline
    || typeof timeline !== 'object' || Array.isArray(timeline)) return null;
  const entries = Array.isArray(timeline.S) ? timeline.S : timeline.S ? [timeline.S] : [];
  if (entries.length === 0 || entries.length > MAX_TRACK_SEGMENTS) return null;
  const values = {
    RepresentationID: representation.id,
    Bandwidth: representation.bandwidth,
    Number: startNumber,
    Time: 0,
  };
  const initializationUrl = templateUrl(template['@_initialization'], base, values);
  if (!initializationUrl || initializationUrl.length > urlCharacterLimit) return null;
  let urlCharacters = initializationUrl.length;
  const segments = [];
  const segmentUrls = new Set();
  let nextTimestamp = 0;
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    const duration = unsignedInteger(entry['@_d']);
    const timestamp = unsignedInteger(entry['@_t'], nextTimestamp);
    const repeat = unsignedInteger(entry['@_r'], 0);
    if (!duration || timestamp !== nextTimestamp || repeat === null
      || repeat >= MAX_TRACK_SEGMENTS || segments.length + repeat + 1 > Math.min(MAX_TRACK_SEGMENTS, segmentLimit)) return null;
    const end = timestamp + duration * (repeat + 1);
    if (!Number.isSafeInteger(end) || !Number.isSafeInteger(startNumber + segments.length + repeat)) return null;
    for (let index = 0; index <= repeat; index += 1) {
      const time = timestamp + duration * index;
      const url = templateUrl(template['@_media'], base, {
        ...values, Number: startNumber + segments.length, Time: time,
      });
      if (!url || segmentUrls.has(url) || urlCharacters + url.length > urlCharacterLimit) return null;
      urlCharacters += url.length;
      segmentUrls.add(url);
      segments.push({ url, duration: duration / timescale, timestamp: time / timescale });
    }
    nextTimestamp = end;
  }
  return { initializationUrl, segments, timescale };
}
