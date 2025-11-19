// 存储捕获的视频信息
let videoInfo = {};

// 存储每个标签页的当前 URL
let tabUrls = {};

// 存储已处理的URL,用于去重
let processedUrls = new Map();

// 存储下载状态（持久化）
let downloadStates = {};

// 下载统计
let downloadStats = {};

// 监听网络请求
chrome.webRequest.onBeforeRequest.addListener(
  async (details) => {
    const url = details.url;
    const tabId = details.tabId;
    
    // 忽略无效的tabId
    if (!tabId || tabId < 0) {
      return;
    }
    
    // 只处理主请求类型
    if (details.type !== 'xmlhttprequest' && details.type !== 'other') {
      return;
    }
    
    // 检测主m3u8请求（包含分辨率列表）
    // 使用正则表达式精确匹配主清单文件
    
    // 规则1: api.rplay.live 的 master.m3u8 格式
    // 例如: https://api.rplay.live/content/hlsstream?parent=1&s3key=us/ivs/v1/.../media/hls/master.m3u8&token=...
    const rplayLivePattern = /^https:\/\/api\.rplay\.live\/content\/hlsstream\?.*media\/hls\/master\.m3u8.*$/;
    
    // 规则2: api.rplay-cdn.com 的主清单 .m3u8 格式
    // 匹配: https://api.rplay-cdn.com/content/hlsstream?s3key=.../xxx.m3u8&...
    // 排除: 包含 playlist.m3u8 或 _hls.m3u8 的子清单
    const rplayCdnPattern = /^https:\/\/api\.rplay-cdn\.com\/content\/hlsstream\?s3key=.*(?<!playlist|_hls)\.m3u8.*$/;
    
    const isMasterPlaylist = rplayLivePattern.test(url) || rplayCdnPattern.test(url);
    
    if (isMasterPlaylist) {
      
      // 去重：检查是否在最近3秒内已处理过相同URL
      const now = Date.now();
      const cacheKey = `${tabId}-${url}`;
      const lastProcessed = processedUrls.get(cacheKey);
      if (lastProcessed && (now - lastProcessed) < 3000) {
        console.log('跳过重复请求:', url);
        return;
      }
      
      // 记录处理时间
      processedUrls.set(cacheKey, now);
      
      console.log('检测到主m3u8请求:', url, '类型:', details.type);
      
      // 延迟获取响应内容
      setTimeout(async () => {
        try {
          const response = await fetch(url);
          const m3u8Content = await response.text();
          
          // 解析m3u8内容（现在是异步函数）
          const videoData = await parseMainM3u8(m3u8Content, url);
          
          if (videoData) {
            // 检查是否已存在相同的视频（通过URL判断）
            if (!videoInfo[tabId]) {
              videoInfo[tabId] = [];
            }
            
            const isDuplicate = videoInfo[tabId].some(v => v.baseUrl === videoData.baseUrl);
            if (isDuplicate) {
              console.log('跳过重复的视频数据');
              return;
            }
            
            videoInfo[tabId].push({
              ...videoData,
              timestamp: Date.now()
            });
            
            // 更新徽章显示视频数量
            updateBadge(videoInfo[tabId].length.toString(), '#666666', tabId);
            
            // 通知content script（如果存在）
            chrome.tabs.sendMessage(tabId, {
              type: 'VIDEO_DETECTED',
              data: videoData
            }).catch(() => {
              // Content script可能未加载，忽略错误
            });
            
            // 更新存储
            chrome.storage.local.set({ [tabId]: videoInfo[tabId] });
            
            console.log('视频信息已保存:', videoData);
          }
        } catch (error) {
          console.error('获取m3u8内容失败:', error);
        }
      }, 500);
    }
  },
  { urls: ["*://*.rplay-cdn.com/*", "*://*.rplay.live/*"] }  // 添加新域名
);

// 定期清理过期的URL记录（每分钟清理一次）
setInterval(() => {
  const now = Date.now();
  const expireTime = 60000; // 1分钟过期
  
  for (const [key, timestamp] of processedUrls.entries()) {
    if (now - timestamp > expireTime) {
      processedUrls.delete(key);
    }
  }
}, 60000);

// 解析主m3u8文件
async function parseMainM3u8(content, baseUrl) {
  const lines = content.split('\n');
  let aesKeyUrl = null;
  
  // 提取AES密钥URL（如果存在）
  for (let line of lines) {
    if (line.includes('EXT-X-SESSION-KEY') || line.includes('EXT-X-KEY')) {
      const match = line.match(/URI="([^"]+)"/);
      if (match) {
        aesKeyUrl = match[1];
        break;
      }
    }
  }
  
  const streams = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // 解析流信息
    if (line.startsWith('#EXT-X-STREAM-INF:')) {
      const resolutionMatch = line.match(/RESOLUTION=(\d+x\d+)/);
      const bandwidthMatch = line.match(/BANDWIDTH=(\d+)/);
      const frameRateMatch = line.match(/FRAME-RATE=([\d.]+)/);
      
      if (resolutionMatch) {
        const resolution = resolutionMatch[1];
        const bandwidth = bandwidthMatch ? bandwidthMatch[1] : null;
        
        // 下一行应该是实际的播放URL
        if (i + 1 < lines.length) {
          const nextLine = lines[i + 1].trim();
          if (nextLine && !nextLine.startsWith('#')) {
            const streamUrl = nextLine.startsWith('http') ? nextLine : new URL(nextLine, baseUrl).href;
            
            streams.push({
              resolution: resolution,
              bandwidth: bandwidth,
              frameRate: frameRateMatch ? frameRateMatch[1] : null,
              url: streamUrl
            });
          }
        }
      }
    }
  }
  
  if (streams.length === 0) {
    return null;
  }
  
  // 获取视频时长（使用第一个流的URL）
  let duration = null;
  if (streams.length > 0) {
    try {
      duration = await getVideoDuration(streams[0].url);
    } catch (error) {
      console.warn('获取视频时长失败:', error);
    }
  }
  
  return {
    streams: streams,
    aesKeyUrl: aesKeyUrl,  // 可能为null（无加密视频）
    baseUrl: baseUrl,
    duration: duration
  };
}

// 获取视频时长
async function getVideoDuration(streamUrl) {
  try {
    const response = await fetch(streamUrl);
    const m3u8Content = await response.text();
    const lines = m3u8Content.split('\n');
    
    let totalDuration = 0;
    
    for (let line of lines) {
      line = line.trim();
      // 查找 #EXTINF 标签，格式如：#EXTINF:10.0,
      if (line.startsWith('#EXTINF:')) {
        const durationMatch = line.match(/#EXTINF:([\d.]+)/);
        if (durationMatch) {
          totalDuration += parseFloat(durationMatch[1]);
        }
      }
    }
    
    return totalDuration > 0 ? totalDuration : null;
  } catch (error) {
    console.error('解析视频时长失败:', error);
    return null;
  }
}

// 处理来自popup的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GET_VIDEO_INFO') {
    const tabId = request.tabId;
    
    // 如果内存中有数据，直接返回
    if (videoInfo[tabId] && videoInfo[tabId].length > 0) {
      sendResponse({ videos: videoInfo[tabId] });
    } else {
      // 如果内存中没有，尝试从storage恢复
      chrome.storage.local.get([tabId.toString()], (result) => {
        const videos = result[tabId.toString()] || [];
        if (videos.length > 0) {
          videoInfo[tabId] = videos;
          console.log('从storage恢复视频信息:', videos.length, '个视频');
        }
        sendResponse({ videos: videos });
      });
      return true;  // 异步响应
    }
  } else if (request.type === 'GET_DOWNLOAD_STATE') {
    const tabId = request.tabId;
    sendResponse({ state: downloadStates[tabId] || null });
  } else if (request.type === 'DOWNLOAD_VIDEO') {
    // 启动下载
    downloadVideo(request.data, request.tabId, request.downloadId);
    sendResponse({ success: true });
  } else if (request.type === 'DOWNLOAD_PROGRESS_UPDATE') {
    // 处理来自content script的进度更新
    const tabId = request.tabId;
    const completed = request.completed;
    const total = request.total;
    const speed = request.speed;
    
    // 计算进度百分比
    const progress = Math.round((completed / total) * 100);
    
    // 更新下载状态
    updateDownloadState(tabId, {
      progress: progress,
      completedSegments: completed,
      totalSegments: total,
      speed: speed,
      status: progress === 100 ? 'merging' : 'downloading',
      message: progress === 100 ? '正在合并片段...' : `下载中 ${completed}/${total} 片段`
    });
    
    // 广播进度更新
    broadcastMessage({
      type: 'DOWNLOAD_PROGRESS',
      tabId: tabId,
      progress: progress,
      state: downloadStates[tabId]
    });
    
    sendResponse({ success: true });
  }
  return true;
});

// 下载视频函数（支持加密和非加密视频）
async function downloadVideo(videoData, tabId, downloadId = '0-0') {
  const statsId = `${tabId}-${Date.now()}`;
  
  try {
    // 初始化下载状态
    downloadStates[tabId] = {
      status: 'downloading',
      progress: 0,
      speed: 0,
      message: '正在准备下载...',
      downloadId: downloadId
    };
    
    downloadStats[statsId] = {
      startTime: Date.now(),
      downloadedSize: 0
    };
    
    broadcastMessage({
      type: 'DOWNLOAD_STARTED',
      tabId: tabId,
      state: downloadStates[tabId]
    });
    
    updateBadge('↓', '#007bff', tabId);
    
    const { streamUrl, aesKeyUrl, resolution } = videoData;
    const hasEncryption = !!aesKeyUrl;  // 检查是否有加密
    
    updateDownloadState(tabId, { 
      status: 'preparing',
      message: hasEncryption ? '正在准备下载（加密视频）...' : '正在准备下载...',
      progress: 0
    });
    
    console.log('获取流URL:', streamUrl);
    console.log('AES密钥URL:', aesKeyUrl || '无加密');
    
    const response = await fetch(streamUrl);
    const m3u8Content = await response.text();
    const lines = m3u8Content.split('\n');
    
    const tsUrls = [];
    const baseUrl = streamUrl.substring(0, streamUrl.lastIndexOf('/') + 1);
    
    for (let line of lines) {
      line = line.trim();
      if (line && !line.startsWith('#')) {
        const tsUrl = line.startsWith('http') ? line : baseUrl + line;
        tsUrls.push(tsUrl);
      }
    }
    
    if (tsUrls.length === 0) {
      throw new Error('未找到视频片段');
    }
    
    console.log(`找到 ${tsUrls.length} 个视频片段`);
    
    updateDownloadState(tabId, { 
      status: 'downloading',
      message: `准备下载 ${tsUrls.length} 个片段`,
      totalSegments: tsUrls.length,
      completedSegments: 0,
      progress: 0
    });
    
    // 获取页面标题作为文件名
    let filename = `rplay_${resolution}_${Date.now()}.ts`;
    try {
      const titleResults = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: () => {
          // 优先从 meta 标签获取标题
          const metaTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
                           document.querySelector('meta[name="title"]')?.getAttribute('content') ||
						   document.querySelector('meta[name="twitter:title"]')?.getAttribute('content') ||
                           document.title;
          return metaTitle;
        }
      });
      
      if (titleResults && titleResults[0] && titleResults[0].result) {
        const pageTitle = titleResults[0].result.trim();
        // 清理文件名中的非法字符
        const cleanTitle = pageTitle.replace(/[<>:"/\\|?*]/g, '_').substring(0, 100);
        filename = `${cleanTitle}_${resolution}.ts`;
      }
    } catch (error) {
      console.warn('无法获取页面标题，使用默认文件名:', error);
    }
    
    // 根据是否有加密选择不同的下载方法
    if (hasEncryption) {
      await downloadEncryptedVideo(tsUrls, aesKeyUrl, filename, tabId, statsId);
    } else {
      await downloadUnencryptedVideo(tsUrls, filename, tabId, statsId);
    }
    
  } catch (error) {
    console.error('下载过程出错:', error);
    
    updateBadge('✗', '#dc3545', tabId);
    
    updateDownloadState(tabId, { 
      status: 'error', 
      message: error.message || '下载失败' 
    });
    
    broadcastMessage({
      type: 'DOWNLOAD_ERROR',
      tabId: tabId,
      error: error.message || '下载失败',
      state: downloadStates[tabId]
    });
    
    setTimeout(() => {
      updateBadge(videoInfo[tabId] ? videoInfo[tabId].length.toString() : '', '#667eea', tabId);
      delete downloadStates[tabId];
      delete downloadStats[statsId];
    }, 3000);
  }
}

// 下载加密视频（原有的逻辑）
async function downloadEncryptedVideo(tsUrls, aesKeyUrl, filename, tabId, statsId) {
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: async (urls, key, fname, bgTabId) => {
      try {
        console.log('开始在页面中下载和解密视频...');
        
        // 定义进度报告函数
        const reportProgress = (completed, total, speed = 0) => {
          window.postMessage({
            type: 'RPLAY_DOWNLOAD_PROGRESS',
            tabId: bgTabId,
            completed: completed,
            total: total,
            speed: speed
          }, '*');
        };
        
        // 导入密钥
        reportProgress(0, urls.length);
        const keyResponse = await fetch(key);
        const keyData = await keyResponse.arrayBuffer();
        const cryptoKey = await crypto.subtle.importKey(
          'raw',
          keyData,
          { name: 'AES-CBC' },
          false,
          ['decrypt']
        );
        
        console.log('密钥导入成功，开始下载', urls.length, '个片段');
        
        // 下载并解密所有片段
        const decryptedBlobs = [];
        let downloadedBytes = 0;
        let lastReportTime = Date.now();
        let lastDownloadedBytes = 0;
        
        for (let i = 0; i < urls.length; i++) {
          const response = await fetch(urls[i]);
          const encryptedData = await response.arrayBuffer();
          
          downloadedBytes += encryptedData.byteLength;
          
          // 计算速度并报告进度
          const now = Date.now();
          if (i % 5 === 0 || now - lastReportTime >= 1000) {
            const timeDiff = (now - lastReportTime) / 1000;
            const bytesDiff = downloadedBytes - lastDownloadedBytes;
            const speed = timeDiff > 0 ? bytesDiff / timeDiff : 0;
            
            reportProgress(i + 1, urls.length, speed);
            
            lastReportTime = now;
            lastDownloadedBytes = downloadedBytes;
          }
          
          // 解密
          const iv = new Uint8Array(16);
          new DataView(iv.buffer).setUint32(12, i, false);
          
          let decryptedData;
          try {
            decryptedData = await crypto.subtle.decrypt(
              { name: 'AES-CBC', iv: iv },
              cryptoKey,
              encryptedData
            );
          } catch (e) {
            try {
              const zeroIV = new Uint8Array(16);
              decryptedData = await crypto.subtle.decrypt(
                { name: 'AES-CBC', iv: zeroIV },
                cryptoKey,
                encryptedData
              );
            } catch (e2) {
              console.warn(`片段 ${i + 1} 解密失败，使用原始数据`);
              decryptedData = encryptedData;
            }
          }
          
          decryptedBlobs.push(new Blob([decryptedData]));
        }
        
        // 报告合并状态
        reportProgress(urls.length, urls.length, 0);
        console.log('所有片段处理完成，开始合并...');
        
        // 合并Blob
        const mergedBlob = new Blob(decryptedBlobs, { type: 'video/mp2t' });
        console.log('合并完成，大小:', (mergedBlob.size / 1024 / 1024).toFixed(2), 'MB');
        
        // 下载
        const url = URL.createObjectURL(mergedBlob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = fname;
        document.body.appendChild(a);
        a.click();
        
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 100);
        
        return { success: true, size: mergedBlob.size, totalBytes: downloadedBytes };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
    args: [tsUrls, aesKeyUrl, filename, tabId]
  }).then((results) => {
    if (results && results[0] && results[0].result && results[0].result.success) {
      console.log('下载成功！');
      
      const totalTime = (Date.now() - downloadStats[statsId].startTime) / 1000;
      const totalBytes = results[0].result.totalBytes || 0;
      const avgSpeed = totalBytes > 0 ? totalBytes / totalTime : 0;
      
      updateDownloadState(tabId, { 
        status: 'completed', 
        message: `下载完成！`,
        progress: 100,
        totalTime: totalTime,
        avgSpeed: avgSpeed,
        downloadedSize: totalBytes
      });
      
      updateBadge('✓', '#28a745', tabId);
      
      broadcastMessage({
        type: 'DOWNLOAD_COMPLETE',
        tabId: tabId,
        filename: filename,
        state: downloadStates[tabId]
      });
      
      setTimeout(() => {
        updateBadge(videoInfo[tabId] ? videoInfo[tabId].length.toString() : '', '#667eea', tabId);
        delete downloadStates[tabId];
        delete downloadStats[statsId];
      }, 3000);
    } else {
      const error = results && results[0] && results[0].result ? results[0].result.error : '未知错误';
      throw new Error('下载失败: ' + error);
    }
  }).catch((error) => {
    console.error('下载失败:', error);
    
    updateBadge('✗', '#dc3545', tabId);
    
    updateDownloadState(tabId, { 
      status: 'error', 
      message: error.message || '下载失败' 
    });
    
    broadcastMessage({
      type: 'DOWNLOAD_ERROR',
      tabId: tabId,
      error: error.message || '下载失败',
      state: downloadStates[tabId]
    });
    
    setTimeout(() => {
      updateBadge(videoInfo[tabId] ? videoInfo[tabId].length.toString() : '', '#667eea', tabId);
      delete downloadStates[tabId];
      delete downloadStats[statsId];
    }, 3000);
  });
}

// 下载非加密视频（新增逻辑）
async function downloadUnencryptedVideo(tsUrls, filename, tabId, statsId) {
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: async (urls, fname, bgTabId) => {
      try {
        console.log('开始下载非加密视频...');
        
        // 定义进度报告函数
        const reportProgress = (completed, total, speed = 0) => {
          window.postMessage({
            type: 'RPLAY_DOWNLOAD_PROGRESS',
            tabId: bgTabId,
            completed: completed,
            total: total,
            speed: speed
          }, '*');
        };
        
        reportProgress(0, urls.length);
        console.log('开始下载', urls.length, '个片段');
        
        // 下载所有片段（无需解密）
        const blobs = [];
        let downloadedBytes = 0;
        let lastReportTime = Date.now();
        let lastDownloadedBytes = 0;
        
        for (let i = 0; i < urls.length; i++) {
          const response = await fetch(urls[i]);
          const data = await response.arrayBuffer();
          
          downloadedBytes += data.byteLength;
          
          // 计算速度并报告进度
          const now = Date.now();
          if (i % 5 === 0 || now - lastReportTime >= 1000) {
            const timeDiff = (now - lastReportTime) / 1000;
            const bytesDiff = downloadedBytes - lastDownloadedBytes;
            const speed = timeDiff > 0 ? bytesDiff / timeDiff : 0;
            
            reportProgress(i + 1, urls.length, speed);
            
            lastReportTime = now;
            lastDownloadedBytes = downloadedBytes;
          }
          
          blobs.push(new Blob([data]));
        }
        
        // 报告合并状态
        reportProgress(urls.length, urls.length, 0);
        console.log('所有片段下载完成，开始合并...');
        
        // 合并Blob
        const mergedBlob = new Blob(blobs, { type: 'video/mp2t' });
        console.log('合并完成，大小:', (mergedBlob.size / 1024 / 1024).toFixed(2), 'MB');
        
        // 下载
        const url = URL.createObjectURL(mergedBlob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = fname;
        document.body.appendChild(a);
        a.click();
        
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 100);
        
        return { success: true, size: mergedBlob.size, totalBytes: downloadedBytes };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
    args: [tsUrls, filename, tabId]
  }).then((results) => {
    if (results && results[0] && results[0].result && results[0].result.success) {
      console.log('下载成功！');
      
      const totalTime = (Date.now() - downloadStats[statsId].startTime) / 1000;
      const totalBytes = results[0].result.totalBytes || 0;
      const avgSpeed = totalBytes > 0 ? totalBytes / totalTime : 0;
      
      updateDownloadState(tabId, { 
        status: 'completed', 
        message: `下载完成！`,
        progress: 100,
        totalTime: totalTime,
        avgSpeed: avgSpeed,
        downloadedSize: totalBytes
      });
      
      updateBadge('✓', '#28a745', tabId);
      
      broadcastMessage({
        type: 'DOWNLOAD_COMPLETE',
        tabId: tabId,
        filename: filename,
        state: downloadStates[tabId]
      });
      
      setTimeout(() => {
        updateBadge(videoInfo[tabId] ? videoInfo[tabId].length.toString() : '', '#667eea', tabId);
        delete downloadStates[tabId];
        delete downloadStats[statsId];
      }, 3000);
    } else {
      const error = results && results[0] && results[0].result ? results[0].result.error : '未知错误';
      throw new Error('下载失败: ' + error);
    }
  }).catch((error) => {
    console.error('下载失败:', error);
    
    updateBadge('✗', '#dc3545', tabId);
    
    updateDownloadState(tabId, { 
      status: 'error', 
      message: error.message || '下载失败' 
    });
    
    broadcastMessage({
      type: 'DOWNLOAD_ERROR',
      tabId: tabId,
      error: error.message || '下载失败',
      state: downloadStates[tabId]
    });
    
    setTimeout(() => {
      updateBadge(videoInfo[tabId] ? videoInfo[tabId].length.toString() : '', '#667eea', tabId);
      delete downloadStates[tabId];
      delete downloadStats[statsId];
    }, 3000);
  });
}

// 更新下载状态
function updateDownloadState(tabId, updates) {
  if (!downloadStates[tabId]) {
    downloadStates[tabId] = {};
  }
  
  Object.assign(downloadStates[tabId], updates);
  
  broadcastMessage({
    type: 'DOWNLOAD_STATE_UPDATE',
    tabId: tabId,
    state: downloadStates[tabId]
  });
}

// 广播消息
function broadcastMessage(message) {
  chrome.runtime.sendMessage(message).catch(() => {});
  
  if (message.tabId && message.tabId > 0) {
    chrome.tabs.sendMessage(message.tabId, message).catch(() => {});
  }
}

// 更新徽章
function updateBadge(text, color, tabId) {
  if (tabId) {
    chrome.action.setBadgeText({ text: text, tabId: tabId });
    chrome.action.setBadgeBackgroundColor({ color: color, tabId: tabId });
  } else {
    chrome.action.setBadgeText({ text: text });
    chrome.action.setBadgeBackgroundColor({ color: color });
  }
}

// 监听标签页更新（页面导航）
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // 当页面开始加载新URL时（导航发生）
  if (changeInfo.url || (changeInfo.status === 'loading' && tab.url)) {
    const currentUrl = changeInfo.url || tab.url;
    const previousUrl = tabUrls[tabId];
    
    // 如果 URL 发生变化（排除首次加载的情况）
    if (previousUrl && previousUrl !== currentUrl) {
      console.log(`标签页 ${tabId} 导航: ${previousUrl} -> ${currentUrl}`);
      console.log('清理旧视频列表...');
      
      // 清理视频信息
      if (videoInfo[tabId]) {
        delete videoInfo[tabId];
        chrome.storage.local.remove(tabId.toString());
      }
      
      // 重置徽章
      updateBadge('', '#666666', tabId);
      
      // 如果有正在进行的下载，取消它
      if (downloadStates[tabId]) {
        delete downloadStates[tabId];
      }
    }
    
    // 更新记录的 URL
    tabUrls[tabId] = currentUrl;
  }
});

// 清理关闭的标签页数据
chrome.tabs.onRemoved.addListener((tabId) => {
  if (videoInfo[tabId]) {
    delete videoInfo[tabId];
    chrome.storage.local.remove(tabId.toString());
    console.log(`已清理标签页 ${tabId} 的数据`);
  }
  if (downloadStates[tabId]) {
    delete downloadStates[tabId];
  }
  if (tabUrls[tabId]) {
    delete tabUrls[tabId];
  }
});

console.log('RPlay Video Downloader background script loaded');
