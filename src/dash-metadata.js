import { XMLParser } from 'fast-xml-parser';
import { expandDashSegmentTemplate } from './dash-segments.js';

const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;
const MAX_MANIFEST_SEGMENTS = 20000;
const MAX_EXPANDED_URL_CHARACTERS = 4 * 1024 * 1024;
const parser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
  ignoreDeclaration: true,
  ignorePiTags: true,
  maxNestedTags: 40,
});

function asArray(value) {
  return value === undefined || value === null ? [] : Array.isArray(value) ? value : [value];
}

function resolveHttpUrl(value, base) {
  try {
    const url = new URL(value, base);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function durationSeconds(value) {
  const match = /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(value || '');
  if (!match) return null;
  const total = Number(match[1] || 0) * 86400 + Number(match[2] || 0) * 3600
    + Number(match[3] || 0) * 60 + Number(match[4] || 0);
  return Number.isFinite(total) && total > 0 ? total : null;
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function representationUrl(manifestUrl, id) {
  const url = new URL(manifestUrl);
  url.hash = `representation=${encodeURIComponent(id)}`;
  return url.href;
}

function mediaType(attributes, bases) {
  const declared = attributes.contentType || attributes.mimeType?.split('/')[0];
  if (declared === 'video' || declared === 'audio') return declared;
  if (/^(avc|hev|hvc|av01|vp0[89])/.test(attributes.codecs || '') || positiveNumber(attributes.width)) return 'video';
  if (/^(mp4a|ac-3|ec-3|opus)/.test(attributes.codecs || '')) return 'audio';
  if (bases.some((url) => /\.cmfv$/i.test(new URL(url).pathname))) return 'video';
  if (bases.some((url) => /\.(?:cmfa|m4a)$/i.test(new URL(url).pathname))) return 'audio';
  return null;
}

export function parseDashMetadata(content, manifestUrl) {
  // MPDs do not need a DTD. Reject custom entities instead of interpreting
  // externally supplied document declarations in the service worker.
  if (content.length > MAX_MANIFEST_BYTES || /<!DOCTYPE\b|<!ENTITY\b/i.test(content)) {
    throw new Error('Unsupported MPD document');
  }
  const document = parser.parse(content, true);
  if (!document.MPD || typeof document.MPD !== 'object' || Array.isArray(document.MPD)) {
    throw new Error('Invalid DASH manifest');
  }

  const relatedUrls = new Set([manifestUrl]);
  const representations = [];
  let expandedSegmentCount = 0;
  let expandedUrlCharacters = 0;
  let hasContentProtection = false;
  const periods = asArray(document.MPD.Period);
  const presentationUnsupported = document.MPD['@_type'] === 'dynamic' || periods.length !== 1
    || Boolean(durationSeconds(periods[0]?.['@_start']));
  function visit(node, inheritedBases, inherited = {}, tag = 'MPD') {
    if (!node || typeof node !== 'object') return;
    if (Object.hasOwn(node, 'ContentProtection')) hasContentProtection = true;
    const declaredBases = asArray(node.BaseURL).map((base) => (
      typeof base === 'string' ? base : base?.['#text']
    )).filter((base) => typeof base === 'string' && base.trim());
    if (declaredBases.length > 64) throw new Error('Too many MPD BaseURL alternatives');
    const bases = declaredBases.length > 0
      ? [...new Set(inheritedBases.flatMap((base) => declaredBases
        .map((value) => resolveHttpUrl(value.trim(), base)).filter(Boolean)))]
      : inheritedBases;
    if (bases.length > 64) throw new Error('Too many MPD BaseURL combinations');
    const attributes = { ...inherited.attributes };
    for (const name of ['contentType', 'mimeType', 'codecs', 'width', 'height', 'bandwidth', 'lang']) {
      if (node[`@_${name}`] !== undefined) attributes[name] = node[`@_${name}`];
    }
    const protection = inherited.protection || Object.hasOwn(node, 'ContentProtection');
    const ownSegmentMode = ['SegmentBase', 'SegmentList', 'SegmentTemplate'].find((name) => Object.hasOwn(node, name));
    const segmentMode = ownSegmentMode || inherited.segmentMode;
    const segmentBase = ownSegmentMode === 'SegmentBase'
      ? { ...inherited.segmentBase, ...node.SegmentBase } : inherited.segmentBase;
    const segmentTemplate = ownSegmentMode === 'SegmentTemplate'
      ? (Array.isArray(node.SegmentTemplate) ? null : {
        ...(inherited.segmentMode === 'SegmentTemplate' ? inherited.segmentTemplate : {}),
        ...node.SegmentTemplate,
      }) : inherited.segmentTemplate;
    const hasBase = Boolean(inherited.hasBase || declaredBases.length);
    const main = inherited.main || asArray(node.Role).some((role) => role?.['@_value'] === 'main');
    // Enumerate only concrete URLs declared by the MPD. Directory prefixes,
    // sibling filenames and DRM license endpoints do not establish ownership.
    for (const base of bases) {
      if (/\.(?:cmfv|cmfa|mp4|m4s)$/i.test(new URL(base).pathname)) relatedUrls.add(base);
    }
    for (const segmentInfo of [...asArray(node.SegmentBase), ...asArray(node.SegmentList)]) {
      for (const initialization of asArray(segmentInfo?.Initialization)) {
        for (const base of bases) {
          const url = initialization?.['@_sourceURL'] && resolveHttpUrl(initialization['@_sourceURL'], base);
          if (url) relatedUrls.add(url);
        }
      }
      for (const segment of asArray(segmentInfo?.SegmentURL)) {
        for (const base of bases) {
          const url = segment?.['@_media'] && resolveHttpUrl(segment['@_media'], base);
          if (url) relatedUrls.add(url);
        }
      }
    }
    if (tag === 'Representation') {
      const type = mediaType(attributes, bases);
      if (type) {
        const id = String(node['@_id'] ?? representations.length);
        const templates = [];
        if (!presentationUnsupported && segmentMode === 'SegmentTemplate') {
          // Reserve a share for each CDN alternative before expanding any of
          // them; a small MPD must not amplify into unbounded URL metadata.
          const segmentLimit = Math.floor((MAX_MANIFEST_SEGMENTS - expandedSegmentCount) / (bases.length || 1));
          const characterLimit = Math.floor((MAX_EXPANDED_URL_CHARACTERS - expandedUrlCharacters) / (bases.length || 1));
          for (const base of bases) {
            const expanded = expandDashSegmentTemplate(segmentTemplate, base, {
              id, bandwidth: positiveNumber(attributes.bandwidth),
            }, segmentLimit, characterLimit);
            if (expanded) templates.push(expanded);
          }
          expandedSegmentCount += templates.reduce((total, item) => total + item.segments.length, 0);
          expandedUrlCharacters += templates.reduce((total, item) => total + item.initializationUrl.length
            + item.segments.reduce((sum, segment) => sum + segment.url.length, 0), 0);
        }
        const segments = templates[0] || null;
        for (const template of templates) {
          relatedUrls.add(template.initializationUrl);
          for (const segment of template.segments) relatedUrls.add(segment.url);
        }
        const url = segments ? representationUrl(manifestUrl, id) : hasBase ? bases.find((base) => {
          const path = new URL(base).pathname;
          return !path.endsWith('/') && (/\.(?:cmfv|cmfa|mp4|m4a|m4v)$/i.test(path)
            || (segmentMode === 'SegmentBase' && attributes.mimeType?.endsWith('/mp4')));
        }) : null;
        const initialization = segmentBase?.Initialization;
        const externalInit = initialization?.['@_sourceURL']
          && resolveHttpUrl(initialization['@_sourceURL'], url || manifestUrl) !== url;
        const timeOffset = Number(segmentBase?.['@_presentationTimeOffset'] || 0);
        representations.push({
          id,
          type, url: url || null,
          segments,
          width: positiveNumber(attributes.width), height: positiveNumber(attributes.height),
          bandwidth: positiveNumber(attributes.bandwidth), codecs: attributes.codecs || null,
          language: attributes.lang || null, main,
          hasContentProtection: Boolean(protection),
          unavailableReason: segments ? null : presentationUnsupported || !url || externalInit || timeOffset !== 0
            || (segmentMode && segmentMode !== 'SegmentBase') ? 'dashLayoutUnsupported' : null,
        });
      }
    }
    for (const key of ['Period', 'AdaptationSet', 'Representation']) {
      for (const child of asArray(node[key])) {
        visit(child, bases, { attributes, protection, segmentMode, segmentBase, segmentTemplate, hasBase, main }, key);
      }
    }
  }
  visit(document.MPD, [manifestUrl]);
  const audioTracks = representations.filter((track) => track.type === 'audio');
  const preferredAudio = [...audioTracks].sort((left, right) => (
    Number(Boolean(left.unavailableReason)) - Number(Boolean(right.unavailableReason))
    || Number(left.hasContentProtection) - Number(right.hasContentProtection)
    || Number(Boolean(right.main)) - Number(Boolean(left.main))
    || (right.bandwidth || 0) - (left.bandwidth || 0)
  ))[0] || null;
  const streams = representations.filter((track) => track.type === 'video').map((track) => ({
    // Unsupported layouts still need a stable selection identity in the UI.
    url: track.url || representationUrl(manifestUrl, track.id),
    representationId: track.id,
    resolution: track.width && track.height ? `${track.width}x${track.height}` : null,
    width: track.width, height: track.height,
    bandwidth: (track.bandwidth || 0) + (preferredAudio?.bandwidth || 0) || null,
    codecs: track.codecs,
    videoSegments: track.segments,
    hasExternalAudio: audioTracks.length > 0,
    audioUrl: preferredAudio?.url || null,
    audioRepresentationId: preferredAudio?.id || null,
    audioLanguage: preferredAudio?.language || null,
    audioSegments: preferredAudio?.segments || null,
    hasContentProtection: track.hasContentProtection || Boolean(preferredAudio?.hasContentProtection),
    unavailableReason: track.unavailableReason || preferredAudio?.unavailableReason || null,
  }));
  return {
    relatedUrls: [...relatedUrls],
    hasContentProtection,
    streams,
    duration: durationSeconds(document.MPD['@_mediaPresentationDuration'])
      || (periods.length === 1 ? durationSeconds(periods[0]?.['@_duration']) : null),
  };
}

export async function inspectDashManifest(url, fetchFn) {
  const response = await fetchFn(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (!response.body) throw new Error('Empty DASH manifest');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let content = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_MANIFEST_BYTES) throw new Error('DASH manifest too large');
      content += decoder.decode(value, { stream: true });
    }
    content += decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  return parseDashMetadata(content, response.url || url);
}
