// 初始化国际化文本
function initI18n() {
  // 设置页面文本
  document.getElementById('headerTitle').textContent = '🧿 ' + chrome.i18n.getMessage('headerTitle');
  document.getElementById('headerSubtitle').textContent = chrome.i18n.getMessage('headerSubtitle');
  document.getElementById('noVideoTitle').textContent = chrome.i18n.getMessage('noVideoDetected');
  
  // 处理包含换行的描述文本
  const desc = chrome.i18n.getMessage('noVideoDescription');
  document.getElementById('noVideoDesc').innerHTML = desc.replace(/\n/g, '<br>');
  
  document.getElementById('footerText').textContent = chrome.i18n.getMessage('footerText');
  document.getElementById('githubText').textContent = chrome.i18n.getMessage('github');
}

// 当前下载状态
let downloadingStates = {};
let currentTabId = null;

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
  // 初始化国际化文本
  initI18n();
  
  // 获取当前标签页ID
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    currentTabId = tab.id;
  }
  
  // 加载视频列表（会在加载完成后自动恢复下载状态）
  loadVideos();
  
  // 监听来自background的消息
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'DOWNLOAD_STARTED') {
      handleDownloadStarted(request.tabId, request.state);
    } else if (request.type === 'DOWNLOAD_PROGRESS') {
      updateProgress(request.tabId, request.progress, request.state);
    } else if (request.type === 'DOWNLOAD_STATE_UPDATE') {
      updateDownloadState(request.tabId, request.state);
    } else if (request.type === 'DOWNLOAD_COMPLETE') {
      handleDownloadComplete(request.tabId, request.filename, request.state);
    } else if (request.type === 'DOWNLOAD_ERROR') {
      handleDownloadError(request.tabId, request.error, request.state);
    }
  });
});

// 恢复下载状态
async function restoreDownloadState() {
  if (!currentTabId) return;
  
  chrome.runtime.sendMessage(
    { type: 'GET_DOWNLOAD_STATE', tabId: currentTabId },
    (response) => {
      if (response && response.state) {
        const state = response.state;
        console.log('恢复下载状态:', state);
        
        // 如果正在下载，需要找到对应的下载项并恢复UI
        if (state.status === 'downloading' || state.status === 'preparing' || 
            state.status === 'merging' || state.status === 'converting' || state.status === 'saving') {
          
          // 使用保存的downloadId
          const downloadId = state.downloadId || '0-0';
          const progressContainer = document.getElementById(`progress-${downloadId}`);
          
          if (progressContainer) {
            progressContainer.classList.add('active');
            updateProgressUI(downloadId, state);
            
            // 禁用所有下载按钮
            document.querySelectorAll('.download-btn').forEach(btn => {
              btn.disabled = true;
            });
            
            downloadingStates[currentTabId] = downloadId;
          }
        }
      }
    }
  );
}

// 加载视频列表
async function loadVideos() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (!tab || !tab.url || !tab.url.includes('rplay.live')) {
    showEmptyState();
    return;
  }
  
  chrome.runtime.sendMessage(
    { type: 'GET_VIDEO_INFO', tabId: tab.id },
    (response) => {
      if (response && response.videos && response.videos.length > 0) {
        displayVideos(response.videos, tab.id);
        // 视频列表加载完成后，恢复下载状态
        setTimeout(() => restoreDownloadState(), 100);
      } else {
        showEmptyState();
      }
    }
  );
}

// 显示空状态
function showEmptyState() {
  document.getElementById('emptyState').style.display = 'block';
  document.getElementById('videoList').style.display = 'none';
}

// 显示视频列表
function displayVideos(videos, tabId) {
  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('videoList').style.display = 'block';
  
  const videoList = document.getElementById('videoList');
  videoList.innerHTML = '';
  
  videos.forEach((video, videoIndex) => {
    const videoItem = createVideoItem(video, videoIndex, tabId);
    videoList.appendChild(videoItem);
  });
}

// 创建视频项
function createVideoItem(video, videoIndex, tabId) {
  const videoItem = document.createElement('div');
  videoItem.className = 'video-item';
  videoItem.id = `video-${videoIndex}`;
  
  const timestamp = new Date(video.timestamp).toLocaleTimeString('zh-CN');
  
  let streamsHtml = '';
  video.streams.forEach((stream, streamIndex) => {
    const resolution = stream.resolution;
    const [width, height] = resolution.split('x').map(Number);
    
    // 根据分辨率高度判断清晰度标签
    let qualityBadge = '';
    let qualityText = '';
    if (height >= 1080) {
      qualityText = chrome.i18n.getMessage('qualityHigh');
      qualityBadge = `<span class="quality-badge quality-fhd">${qualityText}</span>`;
    } else if (height >= 720) {
      qualityText = chrome.i18n.getMessage('qualityStandard');
      qualityBadge = `<span class="quality-badge quality-hd">${qualityText}</span>`;
    } else {
      qualityText = chrome.i18n.getMessage('qualityLow');
      qualityBadge = `<span class="quality-badge quality-sd">${qualityText}</span>`;
    }
    
    const bandwidth = stream.bandwidth 
      ? `${(parseInt(stream.bandwidth) / 1000000).toFixed(2)} Mbps` 
      : chrome.i18n.getMessage('unknown');
    
    const downloadId = `${videoIndex}-${streamIndex}`;
    
    streamsHtml += `
      <div class="stream-option" data-download-id="${downloadId}">
        <div class="stream-info">
          <div class="resolution">${resolution}${qualityBadge}</div>
          <div class="bandwidth">${chrome.i18n.getMessage('bitrate')}: ${bandwidth} ${stream.frameRate ? `• ${parseInt(stream.frameRate).toFixed(0)} fps` : ''}</div>
        </div>
        <button class="download-btn" data-stream-index="${streamIndex}" data-video-index="${videoIndex}">
          ${chrome.i18n.getMessage('downloadButton')}
        </button>
      </div>
      <div class="progress-container" id="progress-${downloadId}">
        <div class="progress-text">
          <span id="progress-text-${downloadId}">${chrome.i18n.getMessage('downloading')}</span>
          <span>
            <span id="speed-text-${downloadId}" class="speed-text" style="display: none;"></span>
            <span id="progress-percent-${downloadId}">0%</span>
          </span>
        </div>
        <div class="progress-bar-bg">
          <div class="progress-bar" id="progress-bar-${downloadId}"></div>
        </div>
      </div>
    `;
  });
  
  videoItem.innerHTML = `
    <div class="video-header">
      <div class="video-title">${chrome.i18n.getMessage('videoNumber', [(videoIndex + 1).toString()])}</div>
      <div class="video-time">${timestamp}</div>
    </div>
    ${streamsHtml}
  `;
  
  // 为每个下载按钮添加事件监听
  videoItem.querySelectorAll('.download-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const streamIndex = parseInt(e.target.dataset.streamIndex);
      const videoIndex = parseInt(e.target.dataset.videoIndex);
      startDownload(video, streamIndex, videoIndex, tabId);
    });
  });
  
  return videoItem;
}

// 开始下载
function startDownload(video, streamIndex, videoIndex, tabId) {
  const stream = video.streams[streamIndex];
  const downloadId = `${videoIndex}-${streamIndex}`;
  
  // 禁用所有下载按钮
  document.querySelectorAll('.download-btn').forEach(btn => {
    btn.disabled = true;
  });
  
  // 显示进度条
  const progressContainer = document.getElementById(`progress-${downloadId}`);
  if (progressContainer) {
    progressContainer.classList.add('active');
  }
  
  // 记录下载状态
  downloadingStates[tabId] = downloadId;
  
  // 发送下载请求到background
  chrome.runtime.sendMessage({
    type: 'DOWNLOAD_VIDEO',
    tabId: tabId,
    downloadId: downloadId,  // 传递downloadId
    data: {
      streamUrl: stream.url,
      aesKeyUrl: video.aesKeyUrl,
      resolution: stream.resolution
    }
  });
}

// 处理下载开始
function handleDownloadStarted(tabId, state) {
  console.log('下载已开始', state);
}

// 更新进度
function updateProgress(tabId, progress, state) {
  const downloadId = downloadingStates[tabId];
  if (!downloadId) return;
  
  updateProgressUI(downloadId, state || { progress });
}

// 更新下载状态
function updateDownloadState(tabId, state) {
  const downloadId = downloadingStates[tabId];
  if (!downloadId) return;
  
  updateProgressUI(downloadId, state);
}

// 更新进度UI
function updateProgressUI(downloadId, state) {
  const progressBar = document.getElementById(`progress-bar-${downloadId}`);
  const progressPercent = document.getElementById(`progress-percent-${downloadId}`);
  const progressText = document.getElementById(`progress-text-${downloadId}`);
  const speedText = document.getElementById(`speed-text-${downloadId}`);
  
  if (progressBar && state.progress !== undefined) {
    progressBar.style.width = `${state.progress}%`;
  }
  
  if (progressPercent && state.progress !== undefined) {
    progressPercent.textContent = `${state.progress}%`;
  }
  
  if (progressText) {
    let text = chrome.i18n.getMessage('downloading');
    
    if (state.status === 'preparing') {
      text = state.message || chrome.i18n.getMessage('preparing');
    } else if (state.status === 'downloading') {
      if (state.completedSegments && state.totalSegments) {
        text = chrome.i18n.getMessage('downloadingSegments', [
          state.completedSegments.toString(), 
          state.totalSegments.toString()
        ]);
      } else {
        text = state.message || chrome.i18n.getMessage('downloading');
      }
    } else if (state.status === 'merging') {
      text = chrome.i18n.getMessage('merging');
    } else if (state.status === 'converting') {
      text = chrome.i18n.getMessage('converting');
    } else if (state.status === 'saving') {
      text = chrome.i18n.getMessage('saving');
    }
    
    progressText.textContent = text;
  }
  
  if (speedText && state.speed !== undefined) {
    const speed = formatSpeed(state.speed);
    speedText.textContent = speed;
    speedText.style.display = state.speed > 0 ? 'inline' : 'none';
  }
}

// 格式化速度
function formatSpeed(bytesPerSecond) {
  if (bytesPerSecond < 1024) {
    return `${bytesPerSecond.toFixed(0)} B/s`;
  } else if (bytesPerSecond < 1024 * 1024) {
    return `${(bytesPerSecond / 1024).toFixed(2)} KB/s`;
  } else {
    return `${(bytesPerSecond / 1024 / 1024).toFixed(2)} MB/s`;
  }
}

// 格式化大小
function formatSize(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  } else if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  } else {
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  }
}

// 处理下载完成
function handleDownloadComplete(tabId, filename, state) {
  const downloadId = downloadingStates[tabId];
  
  // 隐藏进度条
  if (downloadId) {
    const progressContainer = document.getElementById(`progress-${downloadId}`);
    if (progressContainer) {
      // 显示完成状态3秒后再隐藏
      setTimeout(() => {
        progressContainer.classList.remove('active');
      }, 3000);
    }
  }
  
  // 启用所有按钮
  document.querySelectorAll('.download-btn').forEach(btn => {
    btn.disabled = false;
  });
  
  // 显示成功消息
  let message = chrome.i18n.getMessage('downloadComplete', [filename]);
  if (state && state.totalTime) {
    message += '\n' + chrome.i18n.getMessage('timeElapsed', [state.totalTime.toFixed(1)]);
  }
  if (state && state.avgSpeed) {
    message += ' | ' + chrome.i18n.getMessage('avgSpeed', [formatSpeed(state.avgSpeed)]);
  }
  
  showStatusMessage(message, 'success');
  
  // 清理状态
  delete downloadingStates[tabId];
}

// 处理下载错误
function handleDownloadError(tabId, error, state) {
  const downloadId = downloadingStates[tabId];
  
  // 隐藏进度条
  if (downloadId) {
    const progressContainer = document.getElementById(`progress-${downloadId}`);
    if (progressContainer) {
      progressContainer.classList.remove('active');
    }
  }
  
  // 启用所有按钮
  document.querySelectorAll('.download-btn').forEach(btn => {
    btn.disabled = false;
  });
  
  // 显示错误消息
  showStatusMessage(chrome.i18n.getMessage('downloadFailed', [error]), 'error');
  
  // 清理状态
  delete downloadingStates[tabId];
}

// 显示状态消息
function showStatusMessage(message, type) {
  const statusMessage = document.getElementById('statusMessage');
  statusMessage.textContent = message;
  statusMessage.className = `status-message ${type}`;
  
  // 5秒后自动隐藏
  setTimeout(() => {
    statusMessage.className = 'status-message';
  }, 5000);
}
