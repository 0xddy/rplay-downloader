// background.js

// ================== 配置常量 ==================
const CONCURRENT_LIMIT = 5; // 并发下载数量
const URL_CACHE_DURATION = 3000; // URL 去重缓存时间（毫秒）
const URL_CACHE_CLEANUP_INTERVAL = 60000; // URL 缓存清理间隔（毫秒）
const URL_CACHE_MAX_AGE = 60000; // URL 缓存最大存活时间（毫秒）
const DELAY_BEFORE_FETCH_M3U8 = 500; // 延迟获取 m3u8 的时间（毫秒）

// URL 匹配正则表达式（编译为常量以提升性能）
const M3U8_PATTERNS = {
  rplayLive: /^https:\/\/api\.rplay\.live\/content\/hlsstream\?.*media\/hls\/master\.m3u8.*$/,
  rplayCdn: /^https:\/\/api\.rplay-cdn\.com\/content\/hlsstream\?s3key=.*(?<!playlist|_hls)\.m3u8.*$/,
  rplayApi2: /^https:\/\/api2\.rplay\.live\/content\/hlsstream\?.*s3key=.*\.m3u8.*$/
};

// m3u8 解析正则
const M3U8_REGEX = {
  extInf: /#EXTINF:([\d.]+)/,
  mediaSequence: /#EXT-X-MEDIA-SEQUENCE:(\d+)/,
  keyUri: /URI="([^"]+)"/,
  keyIv: /IV=(0x[0-9a-fA-F]+)/,
  streamInf: /#EXT-X-STREAM-INF:/,
  resolution: /RESOLUTION=(\d+x\d+)/,
  bandwidth: /BANDWIDTH=(\d+)/
};

// ================== 全局变量 ==================
const videoInfo = {};
const tabUrls = {};
const processedUrls = new Map();
const downloadStates = {};
const downloadStats = {};
// ===============================================

// ================== 工具函数 ==================

/**
 * 检查 URL 是否为有效的 m3u8 主列表
 */
function isM3u8MasterUrl(url) {
  return M3U8_PATTERNS.rplayLive.test(url) || 
         M3U8_PATTERNS.rplayCdn.test(url) || 
         M3U8_PATTERNS.rplayApi2.test(url);
}

/**
 * 检查并更新 URL 缓存，避免重复处理
 */
function shouldProcessUrl(tabId, url) {
  const now = Date.now();
  const cacheKey = `${tabId}-${url}`;
  const cachedTime = processedUrls.get(cacheKey);
  
  if (cachedTime && (now - cachedTime) < URL_CACHE_DURATION) {
    return false;
  }
  
  processedUrls.set(cacheKey, now);
  return true;
}

/**
 * 解析相对 URL 为绝对 URL
 */
function resolveUrl(url, baseUrl) {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  try {
    return new URL(url, baseUrl).href;
  } catch (e) {
    return url;
  }
}

/**
 * 生成安全的文件名
 */
function sanitizeFilename(title, resolution, extension = '.ts') {
  const sanitized = title.replace(/[<>:"/\\|?*]/g, '_').substring(0, 100);
  return `${sanitized}_${resolution}_${Date.now()}${extension}`;
}

// ================== 网络请求监听 ==================

chrome.webRequest.onBeforeRequest.addListener(
  async (details) => {
    const { url, tabId, type } = details;
    
    // 快速过滤无效请求
    if (!tabId || tabId < 0) return;
    if (type !== 'xmlhttprequest' && type !== 'other') return;
    if (!isM3u8MasterUrl(url)) return;
    if (!shouldProcessUrl(tabId, url)) return;
    
    console.log('[RPlay] 检测到主m3u8请求:', url);
    
    // 延迟处理，确保页面已完成必要初始化
    setTimeout(async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          console.warn(`[RPlay] 获取 m3u8 失败: HTTP ${response.status}`);
          return;
        }
        
        const m3u8Content = await response.text();
        const videoData = await parseMainM3u8(m3u8Content, url);
        
        if (!videoData) return;
        
        // 初始化 tabId 对应的视频信息数组
        if (!videoInfo[tabId]) {
          videoInfo[tabId] = [];
        }
        
        // 避免重复添加相同的视频源
        if (videoInfo[tabId].some(v => v.baseUrl === videoData.baseUrl)) {
          return;
        }
        
        // 保存视频信息
        videoInfo[tabId].push({ ...videoData, timestamp: Date.now() });
        updateBadge(videoInfo[tabId].length.toString(), '#666666', tabId);
        
        // 通知 content script 和保存到 storage
        chrome.tabs.sendMessage(tabId, { type: 'VIDEO_DETECTED', data: videoData }).catch(() => {});
        chrome.storage.local.set({ [tabId]: videoInfo[tabId] });
        
        console.log('[RPlay] 视频信息已保存');
      } catch (error) {
        console.error('[RPlay] 获取m3u8失败:', error);
      }
    }, DELAY_BEFORE_FETCH_M3U8);
  },
  { urls: ["*://*.rplay-cdn.com/*", "*://*.rplay.live/*", "*://api2.rplay.live/*"] }
);

// 定期清理过期的 URL 缓存
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of processedUrls.entries()) {
    if (now - timestamp > URL_CACHE_MAX_AGE) {
      processedUrls.delete(key);
    }
  }
}, URL_CACHE_CLEANUP_INTERVAL);

// ================== m3u8 解析函数 ==================

/**
 * 解析主 m3u8 文件，提取流信息、加密密钥等
 */
async function parseMainM3u8(content, baseUrl) {
    const lines = content.split('\n').map(line => line.trim());
    let aesKeyUrl = null;
    let aesIv = null;

    // 提取加密密钥和 IV
    for (const line of lines) {
        if (line.includes('EXT-X-SESSION-KEY') || line.includes('EXT-X-KEY')) {
            const uriMatch = line.match(M3U8_REGEX.keyUri);
            if (uriMatch) {
                aesKeyUrl = resolveUrl(uriMatch[1], baseUrl);
            }
            
            const ivMatch = line.match(M3U8_REGEX.keyIv);
            if (ivMatch) {
                aesIv = ivMatch[1];
            }
        }
    }

    // 提取流信息（分辨率、带宽）
    const streams = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.startsWith('#EXT-X-STREAM-INF:')) continue;
        
        const resolutionMatch = line.match(M3U8_REGEX.resolution);
        const bandwidthMatch = line.match(M3U8_REGEX.bandwidth);
        
        if (!resolutionMatch || i + 1 >= lines.length) continue;
        
        const nextLine = lines[i + 1];
        if (!nextLine || nextLine.startsWith('#')) continue;
        
        const streamUrl = resolveUrl(nextLine, baseUrl);
        streams.push({
            resolution: resolutionMatch[1],
            bandwidth: bandwidthMatch ? bandwidthMatch[1] : null,
            url: streamUrl
        });
    }
    
    if (streams.length === 0) return null;
    
    // 预获取视频时长（用于 UI 显示）
    let duration = null;
    try {
        duration = await getVideoDuration(streams[0].url);
    } catch (e) {
        console.warn('[RPlay] 预获取时长失败，UI将不显示时长:', e);
    }
    
    return { 
        streams, 
        aesKeyUrl, 
        aesIv, 
        baseUrl, 
        duration
    };
}

/**
 * 获取视频总时长（通过解析子 m3u8 文件中的 #EXTINF 标签）
 */
async function getVideoDuration(streamUrl) {
  try {
    const response = await fetch(streamUrl);
    if (!response.ok) return null;
    
    const m3u8Content = await response.text();
    const lines = m3u8Content.split('\n');
    
    let totalDuration = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('#EXTINF:')) continue;
      
      const match = trimmed.match(M3U8_REGEX.extInf);
      if (match) {
        totalDuration += parseFloat(match[1]);
      }
    }
    
    return totalDuration > 0 ? totalDuration : null;
  } catch (error) {
    console.error('[RPlay] 解析视频时长失败:', error);
    return null;
  }
}

// ================== 消息处理 ==================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const { type } = request;
  
  if (type === 'GET_VIDEO_INFO') {
    const tabId = request.tabId;
    if (videoInfo[tabId]?.length > 0) {
      sendResponse({ videos: videoInfo[tabId] });
    } else {
      chrome.storage.local.get([tabId.toString()], (result) => {
        sendResponse({ videos: result[tabId.toString()] || [] });
      });
      return true; // 保持消息通道开放以支持异步响应
    }
  } else if (type === 'GET_DOWNLOAD_STATE') {
    sendResponse({ state: downloadStates[request.tabId] || null });
  } else if (type === 'DOWNLOAD_VIDEO') {
    downloadVideo(request.data, request.tabId, request.downloadId);
    sendResponse({ success: true });
  } else if (type === 'DOWNLOAD_PROGRESS_UPDATE') {
    const { completed, total, speed } = request;
    const progress = Math.round((completed / total) * 100);
    
    updateDownloadState(request.tabId, {
      progress,
      completedSegments: completed,
      totalSegments: total,
      speed,
      status: progress === 100 ? 'merging' : 'downloading',
      message: progress === 100 ? '下载完成，正在收尾...' : `下载中 ${completed}/${total}`
    });
    
    broadcastMessage({ 
      type: 'DOWNLOAD_PROGRESS', 
      tabId: request.tabId, 
      progress, 
      state: downloadStates[request.tabId] 
    });
    
    sendResponse({ success: true });
  }
  
  return true;
});

/**
 * 解析子 m3u8 文件，提取 TS 片段 URL 和其他信息
 */
function parseSubM3u8(content, baseUrl) {
  const lines = content.split('\n').map(line => line.trim());
  const tsUrls = [];
  let mediaSequence = 0;
  
  // 提取媒体序列号
  const seqMatch = content.match(M3U8_REGEX.mediaSequence);
  if (seqMatch) {
    mediaSequence = parseInt(seqMatch[1], 10);
  }
  
  // 提取 TS 片段 URL
  for (const line of lines) {
    if (line && !line.startsWith('#')) {
      tsUrls.push(resolveUrl(line, baseUrl));
    }
  }
  
  return { tsUrls, mediaSequence };
}

// ================== 下载逻辑 ==================

/**
 * 主下载函数：解析 m3u8 并启动 TS 片段下载
 */
async function downloadVideo(videoData, tabId, downloadId = '0-0') {
  const statsId = `${tabId}-${Date.now()}`;
  
  try {
    // 初始化下载状态
    downloadStates[tabId] = { 
      status: 'downloading', 
      progress: 0, 
      speed: 0, 
      message: '准备下载...', 
      downloadId 
    };
    downloadStats[statsId] = { 
      startTime: Date.now(), 
      downloadedSize: 0 
    };
    
    broadcastMessage({ type: 'DOWNLOAD_STARTED', tabId, state: downloadStates[tabId] });
    updateBadge('↓', '#007bff', tabId);
    
    const { streamUrl, aesKeyUrl, aesIv, resolution } = videoData;
    
    updateDownloadState(tabId, { status: 'preparing', message: '解析视频列表...', progress: 0 });
    
    // 获取并解析子 m3u8 文件
    const response = await fetch(streamUrl);
    if (!response.ok) {
      throw new Error(`获取视频列表失败: HTTP ${response.status}`);
    }
    
    const m3u8Content = await response.text();
    const baseUrl = streamUrl.substring(0, streamUrl.lastIndexOf('/') + 1);
    const { tsUrls, mediaSequence } = parseSubM3u8(m3u8Content, baseUrl);
    
    if (tsUrls.length === 0) {
      throw new Error('未找到视频片段');
    }
    
    console.log(`[RPlay] 解析到 ${tsUrls.length} 个视频片段`);
    
    // 生成文件名
    let filename = `rplay_${resolution}_${Date.now()}.ts`;
    try {
      const results = await chrome.scripting.executeScript({ 
        target: { tabId }, 
        func: () => document.title 
      });
      if (results?.[0]?.result) {
        filename = sanitizeFilename(results[0].result, resolution, '.ts');
      }
    } catch (e) {
      // 忽略获取标题失败
    }
    
    updateDownloadState(tabId, { 
      status: 'downloading', 
      message: `准备下载 ${tsUrls.length} 个片段`, 
      totalSegments: tsUrls.length, 
      completedSegments: 0 
    });

    // 启动 TS 片段下载
    await downloadTsSegments(
      tsUrls, 
      aesKeyUrl || null, 
      aesIv || null, 
      mediaSequence, 
      filename, 
      tabId, 
      statsId
    );
    
  } catch (error) {
    handleDownloadError(error, tabId, statsId);
  }
}

/**
 * 统一处理下载错误
 */
function handleDownloadError(error, tabId, statsId) {
  console.error('[RPlay] 下载出错:', error);
  updateBadge('✗', '#dc3545', tabId);
  updateDownloadState(tabId, { 
    status: 'error', 
    message: error.message || '下载失败' 
  });
  broadcastMessage({ 
    type: 'DOWNLOAD_ERROR', 
    tabId, 
    error: error.message, 
    state: downloadStates[tabId] 
  });
  
  // 3秒后恢复 badge 并清理状态
  setTimeout(() => {
    updateBadge(videoInfo[tabId]?.length.toString() || '', '#667eea', tabId);
    delete downloadStates[tabId];
    delete downloadStats[statsId];
  }, 3000);
}

// ================== TS 片段下载 ==================

/**
 * 解析 IV 字符串为 Uint8Array
 */
function parseIV(ivHex) {
  if (!ivHex) return null;
  const hex = ivHex.replace('0x', '');
  const match = hex.match(/.{1,2}/g);
  if (!match) return null;
  return new Uint8Array(match.map(byte => parseInt(byte, 16)));
}

/**
 * 生成动态 IV（基于序列号）
 */
function generateIV(sequenceNumber) {
  const iv = new Uint8Array(16);
  new DataView(iv.buffer).setUint32(12, sequenceNumber, false);
  return iv;
}

/**
 * 下载并保存 TS 片段
 */
async function downloadTsSegments(tsUrls, aesKeyUrl, aesIvString, seqOffset, filename, tabId, statsId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: async (urls, keyUrl, ivHex, startSeq, fname, bgTabId, concurrentLimit) => {
      let writable = null;
      try {
        console.log(`[RPlay] 开始下载 TS 文件: ${fname}`);
        
        // 请求用户选择保存位置
        let fileHandle;
        try {
          fileHandle = await window.showSaveFilePicker({
            suggestedName: fname,
            types: [{ description: 'TS Video File', accept: { 'video/mp2t': ['.ts'] } }],
          });
        } catch (err) {
          if (err.name === 'AbortError') {
            return { success: false, error: '用户取消保存' };
          }
          throw err;
        }

        writable = await fileHandle.createWritable();

        // 初始化加密相关
        let cryptoKey = null;
        let staticIv = null;
        if (keyUrl) {
          const keyResp = await fetch(keyUrl);
          if (!keyResp.ok) throw new Error("密钥下载失败");
          const keyData = await keyResp.arrayBuffer();
          cryptoKey = await crypto.subtle.importKey(
            'raw', 
            keyData, 
            { name: 'AES-CBC' }, 
            false, 
            ['decrypt']
          );
          if (ivHex) {
            const hex = ivHex.replace('0x', '');
            const match = hex.match(/.{1,2}/g);
            if (match) {
              staticIv = new Uint8Array(match.map(byte => parseInt(byte, 16)));
            }
          }
        }

        // 下载状态管理
        let nextIndexToProcess = 0;
        let currentIndexToFetch = 0;
        const downloadedCache = new Map();
        let totalBytes = 0;
        let completedCount = 0;
        let isAborted = false;
        
        // 进度报告（节流：每秒最多一次）
        let lastReportTime = Date.now();
        let lastBytes = 0;
        const reportProgress = () => {
          const now = Date.now();
          if (now - lastReportTime >= 1000) {
            const speed = (totalBytes - lastBytes) / ((now - lastReportTime) / 1000);
            window.postMessage({
              type: 'RPLAY_DOWNLOAD_PROGRESS',
              tabId: bgTabId,
              completed: completedCount,
              total: urls.length,
              speed
            }, '*');
            lastReportTime = now;
            lastBytes = totalBytes;
          }
        };

        // 生成动态 IV（基于序列号）- 必须在注入脚本内部定义
        const generateIV = (sequenceNumber) => {
          const iv = new Uint8Array(16);
          new DataView(iv.buffer).setUint32(12, sequenceNumber, false);
          return iv;
        };

        // 解密数据
        const decryptData = async (data, index) => {
          if (!cryptoKey) return data;
          
          const iv = staticIv || generateIV(startSeq + index);
          try {
            return await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, cryptoKey, data);
          } catch (decryptErr) {
            throw new Error(`片段 ${index} 解密失败: ${decryptErr.message}`);
          }
        };

        // 下载并处理单个片段
        const downloadSegment = async (index, url) => {
          if (isAborted) return;
          
          const resp = await fetch(url);
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          
          let data = await resp.arrayBuffer();
          data = await decryptData(data, index);
          
          downloadedCache.set(index, data);
          
          // 按顺序写入文件
          while (downloadedCache.has(nextIndexToProcess) && !isAborted) {
            const chunk = downloadedCache.get(nextIndexToProcess);
            downloadedCache.delete(nextIndexToProcess);
            
            await writable.write(chunk);
            totalBytes += chunk.byteLength;
            completedCount++;
            nextIndexToProcess++;
          }
          
          reportProgress();
        };

        // 并发下载工作线程
        const worker = async () => {
          while (currentIndexToFetch < urls.length && !isAborted) {
            const myIndex = currentIndexToFetch++;
            try {
              await downloadSegment(myIndex, urls[myIndex]);
            } catch (err) {
              isAborted = true;
              console.error(`[RPlay] 片段 ${myIndex} 下载失败:`, err);
              throw err;
            }
          }
        };

        // 启动并发下载
        const actualLimit = Math.min(concurrentLimit, urls.length);
        const promises = Array.from({ length: actualLimit }, () => worker());
        await Promise.all(promises);

        if (!isAborted) {
          await writable.close();
          return { success: true, totalBytes };
        } else {
          try { await writable.close(); } catch (e) {}
          throw new Error("下载任务因错误被强制终止");
        }

      } catch (err) {
        return { success: false, error: err.message };
      } finally {
        if (writable) {
          try {
            await writable.close();
          } catch (e) {
            // 文件可能已关闭，忽略错误
          }
        }
      }
    },
    args: [tsUrls, aesKeyUrl, aesIvString, seqOffset, filename, tabId, CONCURRENT_LIMIT]
  }).then((results) => {
    const result = results?.[0]?.result;
    
    if (result?.success) {
      handleDownloadSuccess(tabId, statsId, filename, result.totalBytes || 0);
    } else {
      const error = result?.error || '未知错误';
      throw new Error(error);
    }
  }).catch((error) => {
    handleDownloadError(error, tabId, statsId);
  });
}

/**
 * 处理下载成功
 */
function handleDownloadSuccess(tabId, statsId, filename, totalBytes) {
  const totalTime = (Date.now() - downloadStats[statsId].startTime) / 1000;
  const avgSpeed = totalBytes > 0 ? totalBytes / totalTime : 0;
  
  updateDownloadState(tabId, {
    status: 'completed',
    message: '下载完成！',
    progress: 100,
    totalTime,
    avgSpeed,
    downloadedSize: totalBytes
  });
  
  updateBadge('✓', '#28a745', tabId);
  broadcastMessage({ type: 'DOWNLOAD_COMPLETE', tabId, filename, state: downloadStates[tabId] });
  
  // 3秒后恢复 badge 并清理状态
  setTimeout(() => {
    updateBadge(videoInfo[tabId]?.length.toString() || '', '#667eea', tabId);
    delete downloadStates[tabId];
    delete downloadStats[statsId];
  }, 3000);
}

// ================== 工具函数 ==================

/**
 * 更新下载状态并广播
 */
function updateDownloadState(tabId, updates) {
  if (!downloadStates[tabId]) {
    downloadStates[tabId] = {};
  }
  Object.assign(downloadStates[tabId], updates);
  broadcastMessage({ type: 'DOWNLOAD_STATE_UPDATE', tabId, state: downloadStates[tabId] });
}

/**
 * 广播消息到所有监听器
 */
function broadcastMessage(message) {
  chrome.runtime.sendMessage(message).catch(() => {});
  if (message.tabId) {
    chrome.tabs.sendMessage(message.tabId, message).catch(() => {});
  }
}

/**
 * 更新扩展图标 Badge
 */
function updateBadge(text, color, tabId) {
  const badgeOptions = tabId 
    ? { text, color, tabId }
    : { text, color };
    
  chrome.action.setBadgeText({ text: badgeOptions.text, tabId: badgeOptions.tabId });
  chrome.action.setBadgeBackgroundColor({ color: badgeOptions.color, tabId: badgeOptions.tabId });
}

/**
 * 清理标签页相关数据
 */
function cleanupTabData(tabId) {
  if (videoInfo[tabId]) {
    chrome.storage.local.remove(tabId.toString());
    delete videoInfo[tabId];
  }
  delete downloadStates[tabId];
  delete tabUrls[tabId];
}
// ================== 标签页事件监听 ==================

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const currentUrl = changeInfo.url || tab.url;
  const previousUrl = tabUrls[tabId];
  const isUrlChanged = changeInfo.url || (changeInfo.status === 'loading' && tab.url);
  
  if (isUrlChanged && (changeInfo.status === 'loading' || (previousUrl && previousUrl !== currentUrl))) {
    cleanupTabData(tabId);
    updateBadge('', '#666666', tabId);
  }
  
  if (currentUrl) {
    tabUrls[tabId] = currentUrl;
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  cleanupTabData(tabId);
});

console.log('RPlay Video Downloader (Fail-Fast Mode) loaded');