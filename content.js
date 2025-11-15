// 监听来自background的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'VIDEO_DETECTED') {
    console.log('检测到视频:', request.data);
    showVideoNotification(request.data);
  }
});

// 监听来自注入脚本的进度消息
window.addEventListener('message', (event) => {
  // 只接受来自同源的消息
  if (event.source !== window) return;
  
  if (event.data.type === 'RPLAY_DOWNLOAD_PROGRESS') {
    // 转发进度消息到background
    chrome.runtime.sendMessage({
      type: 'DOWNLOAD_PROGRESS_UPDATE',
      tabId: event.data.tabId,
      completed: event.data.completed,
      total: event.data.total,
      speed: event.data.speed
    }).catch(() => {
      // 忽略错误（background可能未监听）
    });
  }
});

// 添加动画样式
function addNotificationStyles() {
  if (document.getElementById('rplay-notification-styles')) {
    return; // 已存在，不重复添加
  }
  
  const style = document.createElement('style');
  style.id = 'rplay-notification-styles';
  style.textContent = `
    @keyframes slideInFromRight {
      from {
        transform: translateX(400px);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
  `;
  
  // 安全地添加到 head，如果 head 不存在则等待
  if (document.head) {
    document.head.appendChild(style);
  } else {
    // 如果 head 还不存在，等待 DOM 加载
    document.addEventListener('DOMContentLoaded', () => {
      if (document.head && !document.getElementById('rplay-notification-styles')) {
        document.head.appendChild(style);
      }
    });
  }
}

// 在页面上显示通知
function showVideoNotification(videoData) {
  // 确保样式已添加
  addNotificationStyles();
  
  // 检查是否已存在通知
  let notification = document.getElementById('rplay-video-notification');
  
  if (!notification) {
    notification = document.createElement('div');
    notification.id = 'rplay-video-notification';
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
      color: #1e293b;
      padding: 16px 20px;
      border-radius: 12px;
      box-shadow: 0 8px 30px rgba(0, 153, 255, 0.25), 0 2px 8px rgba(0, 0, 0, 0.1);
      border: 2px solid #0099ff;
      z-index: 10000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
      font-size: 14px;
      cursor: pointer;
      transition: all 0.3s ease;
      max-width: 320px;
      backdrop-filter: blur(10px);
    `;
    
    notification.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px;">
        <div style="background: linear-gradient(135deg, #0099ff 0%, #0066cc 100%); border-radius: 50%; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(0, 153, 255, 0.3);">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
            <polygon points="8,5 19,12 8,19"/>
          </svg>
        </div>
        <div style="flex: 1;">
          <div style="font-weight: 700; margin-bottom: 5px; color: #0099ff; font-size: 15px;">
            🎬 ${chrome.i18n.getMessage('videoDetected')}
          </div>
          <div style="font-size: 12px; color: #64748b; line-height: 1.4;">
            ${chrome.i18n.getMessage('streamsFound', [videoData.streams.length])}<br>
            <span style="color: #0099ff; font-weight: 600;">${chrome.i18n.getMessage('clickToDownload')}</span>
          </div>
        </div>
      </div>
    `;
    
    notification.addEventListener('mouseenter', () => {
      notification.style.transform = 'scale(1.05) translateY(-2px)';
      notification.style.boxShadow = '0 12px 40px rgba(0, 153, 255, 0.35), 0 4px 12px rgba(0, 0, 0, 0.15)';
      notification.style.borderColor = '#0066cc';
    });
    
    notification.addEventListener('mouseleave', () => {
      notification.style.transform = 'scale(1) translateY(0)';
      notification.style.boxShadow = '0 8px 30px rgba(0, 153, 255, 0.25), 0 2px 8px rgba(0, 0, 0, 0.1)';
      notification.style.borderColor = '#0099ff';
    });
    
    notification.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'OPEN_POPUP' });
    });
    
    // 确保 body 存在再添加
    if (document.body) {
      document.body.appendChild(notification);
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        if (document.body) {
          document.body.appendChild(notification);
        }
      });
    }
    
    // 添加入场动画
    notification.style.animation = 'slideInFromRight 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55)';
    
    // 5秒后自动隐藏
    setTimeout(() => {
      if (notification && notification.parentNode) {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(400px)';
        setTimeout(() => {
          if (notification && notification.parentNode) {
            notification.remove();
          }
        }, 300);
      }
    }, 5000);
  }
}

console.log('RPlay Video Downloader 内容脚本已加载');
