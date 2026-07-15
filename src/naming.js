export function normalizeVideoTitle(value) {
  const normalized = String(value || '')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .replace(/\s*[|｜]\s*RPLAY\s*$/i, '')
    .trim();
  return /^(?:rplay|rplay\.live)$/i.test(normalized) ? '' : normalized;
}

export function selectVideoTitle(candidates) {
  for (const candidate of candidates) {
    const title = normalizeVideoTitle(candidate);
    if (title) return title;
  }
  return '';
}

export function sanitizeFilename(value) {
  const cleaned = normalizeVideoTitle(value || 'rplay')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim();
  return [...(cleaned || 'rplay')].slice(0, 100).join('');
}

export function makeDownloadFilename(task, extension) {
  const title = sanitizeFilename(task.title || 'rplay');
  const resolution = sanitizeFilename(task.resolution || 'video');
  const timestamp = new Date(task.createdAt).toISOString().replace(/[:.]/g, '-');
  return `${title}_${resolution}_${timestamp}.${extension}`;
}
