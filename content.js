import { selectVideoTitle } from './src/naming.js';
import { MessageType } from './src/protocol.js';

let notificationPageUrl = location.href;
const notifiedSourceUrls = new Map();

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.type === MessageType.VIDEO_DETECTED) showVideoNotification(request.data);
  if (request.type === MessageType.VIDEO_INFO_CLEARED) {
    synchronizeNotificationPage();
    document.getElementById('rplay-video-notification')?.remove();
  }
  if (request.type === MessageType.GET_PAGE_VIDEO_TITLE) {
    sendResponse({ title: extractVideoTitle() });
  }
});

function synchronizeNotificationPage() {
  if (notificationPageUrl === location.href) return;
  notificationPageUrl = location.href;
  notifiedSourceUrls.clear();
  document.getElementById('rplay-video-notification')?.remove();
}

function shouldNotifyVideo(videoData) {
  if (!videoData || !Array.isArray(videoData.streams)) return false;
  // A bare CMAF request is only a track observation, not a downloadable video.
  // Keep it in the popup, but do not interrupt playback for every track URL.
  if (videoData.unavailableReason === 'cmafNeedsPlaylist'
    || (videoData.sourceType === 'cmaf' && videoData.streams.length === 0)) return false;
  const unavailableReason = getUnavailableReason(videoData);
  if (videoData.streams.length === 0 && !unavailableReason) return false;

  const playableUrls = videoData.streams
    .filter((stream) => !stream.unavailableReason || stream.unavailableReason === 'dashProtected')
    .map((stream) => stream.url).filter(Boolean);
  if (playableUrls.length === 0 && !unavailableReason) return false;
  const sourceUrls = [videoData.baseUrl, ...playableUrls].filter(Boolean);
  if (sourceUrls.length === 0) return false;
  // Errors stay visible once per reason, without preventing a later playable
  // source from announcing that a download is now available.
  const notificationKind = playableUrls.length > 0 ? 'playable' : unavailableReason;
  if (!notifiedSourceUrls.has(notificationKind)) notifiedSourceUrls.set(notificationKind, new Set());
  const notifiedUrls = notifiedSourceUrls.get(notificationKind);
  const alreadyNotified = sourceUrls.some((url) => notifiedUrls.has(url));
  // Preserve complete URLs: query parameters can identify different videos.
  // Use playable video URLs rather than all related URLs, which may contain
  // shared audio or initialization resources belonging to other sources.
  for (const url of sourceUrls) notifiedUrls.add(url);
  return !alreadyNotified;
}

function getUnavailableReason(videoData) {
  return videoData.unavailableReason
    || (videoData.streams.length > 0 && videoData.streams.every((stream) => stream.unavailableReason)
      ? videoData.streams[0].unavailableReason : null);
}

function extractVideoTitle() {
  const currentHeading = document.querySelector('h2.font-weight-bold.text-content-primary');
  const legacyHeading = document.querySelector('h2.font-weight-bold.text-body-lg');
  const openGraph = document.querySelector('meta[property="og:title"]');
  const twitter = document.querySelector('meta[name="twitter:title"]');
  // RPlay uses client-side navigation. Meta tags can still describe the
  // previous video, so prefer live DOM and tab title before metadata.
  return selectVideoTitle([
    currentHeading?.textContent,
    legacyHeading?.textContent,
    document.title,
    openGraph?.getAttribute('content'),
    twitter?.getAttribute('content'),
  ]);
}

function ensureStyles() {
  if (document.getElementById('rplay-downloader-styles')) return;

  const style = document.createElement('style');
  style.id = 'rplay-downloader-styles';
  style.textContent = `
    @keyframes slideInFromRight {
      from { transform: translateX(400px); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }

    #rplay-video-notification {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10000;
      display: flex;
      align-items: center;
      gap: 12px;
      max-width: 320px;
      padding: 16px 20px;
      border: 2px solid #0099ff;
      border-radius: 12px;
      color: #1e293b;
      background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
      box-shadow: 0 8px 30px rgba(0, 153, 255, 0.25), 0 2px 8px rgba(0, 0, 0, 0.1);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      cursor: pointer;
      transition: all 0.3s;
      backdrop-filter: blur(10px);
      animation: slideInFromRight 0.5s cubic-bezier(0.4, 0, 0.2, 1);
    }

    #rplay-video-notification:hover {
      transform: scale(1.05) translateY(-2px);
      border-color: #0066cc;
      box-shadow: 0 12px 35px rgba(0, 153, 255, 0.35), 0 4px 12px rgba(0, 0, 0, 0.12);
    }

    #rplay-video-notification .rplay-icon {
      display: grid;
      flex: none;
      width: 40px;
      height: 40px;
      place-items: center;
      border-radius: 50%;
      color: white;
      background: linear-gradient(135deg, #0099ff 0%, #0066cc 100%);
      box-shadow: 0 3px 10px rgba(0, 153, 255, 0.35);
    }

    #rplay-video-notification .rplay-icon svg {
      width: 20px;
      height: 20px;
    }

    #rplay-video-notification strong {
      display: block;
      margin-bottom: 3px;
      color: #0099ff;
      font-size: 15px;
      font-weight: 700;
    }

    #rplay-video-notification span {
      color: #64748b;
      font-size: 12px;
      line-height: 1.4;
    }
  `;
  (document.head || document.documentElement).appendChild(style);
}

function showVideoNotification(videoData) {
  synchronizeNotificationPage();
  if (!shouldNotifyVideo(videoData)) return;
  ensureStyles();
  document.getElementById('rplay-video-notification')?.remove();

  const notification = document.createElement('div');
  notification.id = 'rplay-video-notification';
  notification.setAttribute('role', 'button');
  notification.setAttribute('tabindex', '0');

  const icon = document.createElement('div');
  icon.className = 'rplay-icon';
  icon.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <polygon points="9 7 17 12 9 17" fill="currentColor"></polygon>
    </svg>
  `;

  const copy = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = chrome.i18n.getMessage('videoDetected') || '检测到视频资源';
  const detail = document.createElement('span');
  const unavailableReason = getUnavailableReason(videoData);
  detail.textContent = unavailableReason && unavailableReason !== 'dashProtected'
    ? chrome.i18n.getMessage(unavailableReason)
    : chrome.i18n.getMessage('streamsFound', [String(videoData.streams.length)])
      || `找到 ${videoData.streams.length} 个清晰度选项`;
  copy.append(title, detail);
  notification.append(icon, copy);

  const openPopup = () => chrome.runtime.sendMessage({ type: MessageType.OPEN_POPUP }).catch(() => {});
  notification.addEventListener('click', openPopup);
  notification.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') openPopup();
  });

  (document.body || document.documentElement).appendChild(notification);
  setTimeout(() => notification.remove(), 5_000);
}

console.log('RPlay Video Downloader content v2 loaded');
