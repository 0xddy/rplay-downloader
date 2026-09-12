import { getPlaylistDuration, getUnsupportedHlsEncryption, parseAttributeList, parseMasterPlaylist, resolveUrl } from './hls.js';
import { normalizeVideoTitle } from './naming.js';
import { inspectDashManifest } from './dash-metadata.js';

export function getRPlaySourceType(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol)) return null;
  if (!['rplay.live', 'rplay-cdn.com'].some((host) => (
    url.hostname === host || url.hostname.endsWith(`.${host}`)
  ))) return null;

  if (/\.m3u8$/i.test(url.pathname)) return 'hls';
  // The response validates this dedicated endpoint; parameter names/order and
  // percent-encoding have changed between API versions.
  if (url.pathname === '/content/hlsstream') return 'hls';
  if (/\.mpd$/i.test(url.pathname)) return 'dash';
  if (/\.cmfv$/i.test(url.pathname)) return 'cmaf';
  return null;
}

export function isRPlayMasterUrl(url) {
  return getRPlaySourceType(url) === 'hls';
}

export function shouldInspectMediaRequest({ url, tabId, type, method = 'GET' }) {
  return Number.isInteger(tabId) && tabId >= 0 && method === 'GET'
    && ['xmlhttprequest', 'media', 'other'].includes(type)
    && getRPlaySourceType(url) !== null;
}

export function isKnownVideoSource(videos, url) {
  return videos.some((video) => video.baseUrl === url || video.relatedUrls?.includes(url));
}

export function mergeVideoSources(videos, detected) {
  if (isKnownVideoSource(videos, detected.baseUrl)) return videos;
  const related = new Set(detected.relatedUrls || []);
  // A manifest replaces earlier track-only notices once its actual media URLs
  // are known; sharing a directory alone does not prove that two videos match.
  return [...videos.filter((video) => !related.has(video.baseUrl)
    && !(video.sourceType === 'cmaf' && video.relatedUrls?.some((url) => related.has(url)))), detected];
}

function playlistResourceUrls(content, playlistUrl) {
  return content.split(/\r?\n/).flatMap((raw) => {
    const line = raw.trim();
    if (line.startsWith('#EXT-X-MAP:')) {
      const attributes = parseAttributeList(line.slice(line.indexOf(':') + 1));
      return attributes.URI ? [resolveUrl(attributes.URI, playlistUrl)] : [];
    }
    return line && !line.startsWith('#') ? [resolveUrl(line, playlistUrl)] : [];
  });
}

export async function inspectVideoSource(masterUrl, {
  fetchFn,
  resolveTitle = async () => '',
  now = Date.now,
}) {
  const sourceType = getRPlaySourceType(masterUrl);
  if (!sourceType) return null;
  const metadata = async () => {
    let title = '';
    try {
      title = normalizeVideoTitle(await resolveTitle());
    } catch {
      // Source pages may disappear before title collection completes.
    }
    return { title: title || 'rplay', timestamp: now() };
  };
  if (sourceType !== 'hls') {
    // Resolve DASH tracks from the manifest, never by downloading an entire
    // CMAF track during detection (it can be gigabytes).
    let dashMetadata = null;
    if (sourceType === 'dash') {
      try {
        dashMetadata = await inspectDashManifest(masterUrl, fetchFn);
      } catch {
        // Keep the detected DASH request visible even if a signed URL has
        // expired or the server does not permit an additional manifest fetch.
      }
    }
    const streams = dashMetadata?.streams || [];
    return {
      ...await metadata(),
      sourceType,
      baseUrl: masterUrl,
      relatedUrls: [...new Set([masterUrl, ...(dashMetadata?.relatedUrls || [])])],
      streams,
      sessionKeys: [],
      duration: dashMetadata?.duration || null,
      hasContentProtection: dashMetadata?.hasContentProtection ?? null,
      unavailableReason: sourceType === 'cmaf' ? 'cmafNeedsPlaylist'
        : streams.length > 0 ? (streams.every((stream) => stream.unavailableReason) ? streams[0].unavailableReason : null)
          : 'dashUnsupported',
    };
  }
  const response = await fetchFn(masterUrl);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const content = await response.text();
  if (!/^\s*#EXTM3U(?:\s|$)/.test(content)) return null;
  const playlistUrl = response.url || masterUrl;
  const { streams, audioGroups, sessionKeys } = parseMasterPlaylist(content, playlistUrl);
  if (streams.length === 0) return null;

  const masterProtection = getUnsupportedHlsEncryption(content);
  const relatedUrls = new Set([playlistUrl, ...streams.map((stream) => stream.url),
    ...[...audioGroups.values()].flat().map((track) => track.uri).filter(Boolean)]);
  const playlistCache = new Map();
  const inspectPlaylist = (url) => {
    if (!url) return Promise.resolve(null);
    if (!playlistCache.has(url)) {
      playlistCache.set(url, (async () => {
        try {
          const mediaResponse = await fetchFn(url);
          if (!mediaResponse.ok) return null;
          const media = await mediaResponse.text();
          if (!/^\s*#EXTM3U(?:\s|$)/.test(media)) return null;
          const finalUrl = mediaResponse.url || url;
          relatedUrls.add(finalUrl);
          for (const resource of playlistResourceUrls(media, finalUrl)) relatedUrls.add(resource);
          return { duration: getPlaylistDuration(media), protection: getUnsupportedHlsEncryption(media) };
        } catch {
          // Metadata failures must not hide an otherwise valid source.
          return null;
        }
      })());
    }
    return playlistCache.get(url);
  };
  // Inspect only playlists, with bounded concurrency. Never request media or
  // license/key URLs during detection, and reuse shared audio playlist reads.
  for (let index = 0; index < streams.length; index += 3) {
    await Promise.all(streams.slice(index, index + 3).map(async (stream) => {
      const [media, audio] = await Promise.all([inspectPlaylist(stream.url), inspectPlaylist(stream.audioUrl)]);
      stream.duration = media?.duration || null;
      stream.unavailableReason = masterProtection || media?.protection || audio?.protection ? 'drmUnsupported' : null;
    }));
  }

  return {
    ...await metadata(),
    sourceType,
    streams,
    sessionKeys,
    baseUrl: masterUrl,
    relatedUrls: [...relatedUrls],
    duration: streams.find((stream) => stream.duration)?.duration || null,
  };
}
