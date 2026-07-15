import { getPlaylistDuration, parseMasterPlaylist } from './hls.js';
import { normalizeVideoTitle } from './naming.js';

const MASTER_URL_PATTERNS = [
  /^https:\/\/api\.rplay\.live\/content\/hlsstream\?.*media\/hls\/master\.m3u8.*$/,
  /^https:\/\/api\.rplay-cdn\.com\/content\/hlsstream\?s3key=.*(?<!playlist|_hls)\.m3u8.*$/,
  /^https:\/\/api2\.rplay\.live\/content\/hlsstream\?.*s3key=.*\.m3u8.*$/,
];

export function isRPlayMasterUrl(url) {
  return MASTER_URL_PATTERNS.some((pattern) => pattern.test(url));
}

export async function inspectVideoSource(masterUrl, {
  fetchFn,
  resolveTitle = async () => '',
  now = Date.now,
}) {
  const response = await fetchFn(masterUrl);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const content = await response.text();
  const { streams, sessionKeys } = parseMasterPlaylist(content, masterUrl);
  if (streams.length === 0) return null;

  let duration = null;
  try {
    const mediaResponse = await fetchFn(streams[0].url);
    if (mediaResponse.ok) duration = getPlaylistDuration(await mediaResponse.text());
  } catch {
    // Duration is only an estimate and must not block source detection.
  }

  let title = '';
  try {
    title = normalizeVideoTitle(await resolveTitle());
  } catch {
    // Source pages may disappear before title collection completes.
  }

  return {
    streams,
    sessionKeys,
    baseUrl: masterUrl,
    duration,
    title: title || 'rplay',
    timestamp: now(),
  };
}
