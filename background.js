// background.js

const CONCURRENT_LIMIT = 2; // 设置并发下载数量

// ================== 全局变量 ==================
let videoInfo = {};
let tabUrls = {};
let processedUrls = new Map();
let downloadStates = {};
let downloadStats = {};
// ===============================================

// 1. 监听网络请求
chrome.webRequest.onBeforeRequest.addListener(
  async (details) => {
    const url = details.url;
    const tabId = details.tabId;
    if (!tabId || tabId < 0) return;
    if (details.type !== 'xmlhttprequest' && details.type !== 'other') return;
    
    const rplayLivePattern = /^https:\/\/api\.rplay\.live\/content\/hlsstream\?.*media\/hls\/master\.m3u8.*$/;
    const rplayCdnPattern = /^https:\/\/api\.rplay-cdn\.com\/content\/hlsstream\?s3key=.*(?<!playlist|_hls)\.m3u8.*$/;
    
    if (rplayLivePattern.test(url) || rplayCdnPattern.test(url)) {
      const now = Date.now();
      const cacheKey = `${tabId}-${url}`;
      if (processedUrls.get(cacheKey) && (now - processedUrls.get(cacheKey)) < 3000) return;
      processedUrls.set(cacheKey, now);
      
      console.log('检测到主m3u8请求:', url);
      setTimeout(async () => {
        try {
          const response = await fetch(url);
          const m3u8Content = await response.text();
          const videoData = await parseMainM3u8(m3u8Content, url);
          if (videoData) {
            if (!videoInfo[tabId]) videoInfo[tabId] = [];
            if (videoInfo[tabId].some(v => v.baseUrl === videoData.baseUrl)) return;
            videoInfo[tabId].push({ ...videoData, timestamp: Date.now() });
            updateBadge(videoInfo[tabId].length.toString(), '#666666', tabId);
            chrome.tabs.sendMessage(tabId, { type: 'VIDEO_DETECTED', data: videoData }).catch(() => {});
            chrome.storage.local.set({ [tabId]: videoInfo[tabId] });
            console.log('视频信息已保存');
          }
        } catch (error) { console.error('获取m3u8失败:', error); }
      }, 500);
    }
  },
  { urls: ["*://*.rplay-cdn.com/*", "*://*.rplay.live/*"] }
);

setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of processedUrls.entries()) {
    if (now - timestamp > 60000) processedUrls.delete(key);
  }
}, 60000);

// 2. 解析主m3u8
async function parseMainM3u8(content, baseUrl) {
    const lines = content.split('\n');
    let aesKeyUrl = null;
    let aesIv = null;

    // 1. 提取 Key 和 IV
    for (let line of lines) {
        line = line.trim();
        if (line.includes('EXT-X-SESSION-KEY') || line.includes('EXT-X-KEY')) {
            const uriMatch = line.match(/URI="([^"]+)"/);
            if (uriMatch) {
                let tempKey = uriMatch[1];
                if (tempKey && !tempKey.startsWith('http')) {
                    try { aesKeyUrl = new URL(tempKey, baseUrl).href; } catch(e) { aesKeyUrl = tempKey; }
                } else {
                    aesKeyUrl = tempKey;
                }
            }
            const ivMatch = line.match(/IV=(0x[0-9a-fA-F]+)/);
            if (ivMatch) aesIv = ivMatch[1];
        }
    }

    // 2. 提取流信息（分辨率、带宽）
    const streams = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('#EXT-X-STREAM-INF:')) {
            const resolutionMatch = line.match(/RESOLUTION=(\d+x\d+)/);
            const bandwidthMatch = line.match(/BANDWIDTH=(\d+)/);
            
            if (resolutionMatch && i + 1 < lines.length) {
                const nextLine = lines[i + 1].trim();
                if (nextLine && !nextLine.startsWith('#')) {
                    const streamUrl = nextLine.startsWith('http') ? nextLine : new URL(nextLine, baseUrl).href;
                    
                    streams.push({
                        resolution: resolutionMatch[1],
                        // 关键点：保留 BANDWIDTH，Popup计算大小需要用到它
                        bandwidth: bandwidthMatch ? bandwidthMatch[1] : null, 
                        url: streamUrl
                    });
                }
            }
        }
    }
    
    if (streams.length === 0) return null;
    
    // ================== 修复核心：恢复时长预获取 ==================
    // 这一步会发起一个额外的网络请求去获取子列表，从而计算时长
    let duration = null;
    try { 
        // 随便取第一个流来计算总时长（通常所有分辨率时长一致）
        if (streams.length > 0) {
            // 调用下方的 getVideoDuration 辅助函数
            duration = await getVideoDuration(streams[0].url);
        }
    } catch (e) {
        console.warn('[RPlay] 预获取时长失败，UI将不显示时长:', e);
    }
    // ==========================================================
    
    return { 
        streams, 
        aesKeyUrl, 
        aesIv, 
        baseUrl, 
        duration // 将时长返回给 videoInfo，Popup 就能拿到了
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

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GET_VIDEO_INFO') {
    const tabId = request.tabId;
    if (videoInfo[tabId] && videoInfo[tabId].length > 0) {
      sendResponse({ videos: videoInfo[tabId] });
    } else {
      chrome.storage.local.get([tabId.toString()], (result) => {
        sendResponse({ videos: result[tabId.toString()] || [] });
      });
      return true;
    }
  } else if (request.type === 'GET_DOWNLOAD_STATE') {
    sendResponse({ state: downloadStates[request.tabId] || null });
  } else if (request.type === 'DOWNLOAD_VIDEO') {
    downloadVideo(request.data, request.tabId, request.downloadId);
    sendResponse({ success: true });
  } else if (request.type === 'DOWNLOAD_PROGRESS_UPDATE') {
    const progress = Math.round((request.completed / request.total) * 100);
    updateDownloadState(request.tabId, {
      progress: progress,
      completedSegments: request.completed,
      totalSegments: request.total,
      speed: request.speed,
      status: progress === 100 ? 'merging' : 'downloading',
      message: progress === 100 ? '下载完成，正在收尾...' : `下载中 ${request.completed}/${request.total}`
    });
    broadcastMessage({ type: 'DOWNLOAD_PROGRESS', tabId: request.tabId, progress, state: downloadStates[request.tabId] });
    sendResponse({ success: true });
  }
  return true;
});

// 3. 主下载逻辑
async function downloadVideo(videoData, tabId, downloadId = '0-0') {
  const statsId = `${tabId}-${Date.now()}`;
  try {
    downloadStates[tabId] = { status: 'downloading', progress: 0, speed: 0, message: '准备下载...', downloadId };
    downloadStats[statsId] = { startTime: Date.now(), downloadedSize: 0 };
    broadcastMessage({ type: 'DOWNLOAD_STARTED', tabId: tabId, state: downloadStates[tabId] });
    updateBadge('↓', '#007bff', tabId);
    
    const { streamUrl, aesKeyUrl, aesIv, resolution } = videoData;
    
    updateDownloadState(tabId, { status: 'preparing', message: '解析视频列表...', progress: 0 });
    
    const response = await fetch(streamUrl);
    const m3u8Content = await response.text();
    
    // 解析 Sequence
    let realMediaSequence = 0;
    const seqMatch = m3u8Content.match(/#EXT-X-MEDIA-SEQUENCE:(\d+)/);
    if (seqMatch) realMediaSequence = parseInt(seqMatch[1], 10);

    // 计算总时长
    let totalDuration = 0;
    const durationMatches = m3u8Content.matchAll(/#EXTINF:([\d.]+)/g);
    for (const match of durationMatches) {
        totalDuration += parseFloat(match[1]);
    }
    console.log(`[RPlay] 视频总时长: ${totalDuration}秒`);

    const tsUrls = [];
    const baseUrl = streamUrl.substring(0, streamUrl.lastIndexOf('/') + 1);
    m3u8Content.split('\n').forEach(line => {
      line = line.trim();
      if (line && !line.startsWith('#')) {
        tsUrls.push(line.startsWith('http') ? line : baseUrl + line);
      }
    });
    
    if (tsUrls.length === 0) throw new Error('未找到视频片段');
    
    let filename = `rplay_${resolution}_${Date.now()}.mp4`; 
    try {
      const results = await chrome.scripting.executeScript({ target: { tabId }, func: () => document.title });
      if (results?.[0]?.result) filename = `${results[0].result.replace(/[<>:"/\\|?*]/g, '_').substring(0, 100)}_${resolution}_${Date.now()}.mp4`;
    } catch (e) {}
    
    updateDownloadState(tabId, { 
      status: 'downloading', message: `准备下载 ${tsUrls.length} 个片段`, totalSegments: tsUrls.length, completedSegments: 0 
    });

    // 调用注入脚本
    await downloadWithMux(
        tsUrls, 
        aesKeyUrl || null, 
        aesIv || null, 
        realMediaSequence, 
        filename, 
        tabId, 
        statsId,
        totalDuration || 0 
    );
    
  } catch (error) {
    console.error('下载出错:', error);
    updateBadge('✗', '#dc3545', tabId);
    updateDownloadState(tabId, { status: 'error', message: error.message || '下载失败' });
    broadcastMessage({ type: 'DOWNLOAD_ERROR', tabId: tabId, error: error.message, state: downloadStates[tabId] });
    setTimeout(() => {
        updateBadge(videoInfo[tabId] ? videoInfo[tabId].length.toString() : '', '#667eea', tabId);
        delete downloadStates[tabId];
        delete downloadStats[statsId];
    }, 3000);
  }
}

// ================== 核心：严谨模式下载 (Strict Mode) ==================
async function downloadWithMux(tsUrls, aesKeyUrl, aesIvString, seqOffset, filename, tabId, statsId, durationSec) {
  const limit = CONCURRENT_LIMIT; 

  try {
    await chrome.scripting.executeScript({ target: { tabId: tabId }, files: ['libs/mux.min.js'] });
  } catch (e) {
    throw new Error("无法加载 libs/mux.min.js");
  }

  await chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: async (urls, keyUrl, ivHex, startSeq, fname, bgTabId, concurrentLimit, totalDuration) => {
	  let writable = null;
      try {
        console.log(`[RPlay] 开始严谨模式下载: ${fname}, 时长: ${totalDuration}s`);
        
        const Mux = window.muxjs || window.mux;
        if (!Mux) throw new Error("Mux.js 未加载");

        // 注入时长补丁
        const injectDuration = (initSegment, duration) => {
            if (!duration || duration <= 0) return initSegment;
            const data = new Uint8Array(initSegment);
            const view = new DataView(data.buffer);
            let offset = 0;
            while (offset < data.length) {
                const size = view.getUint32(offset);
                const type = String.fromCharCode(data[offset+4],data[offset+5],data[offset+6],data[offset+7]);
                if (type === 'moov') {
                    let subOffset = offset + 8;
                    const moovEnd = offset + size;
                    while (subOffset < moovEnd) {
                        const subSize = view.getUint32(subOffset);
                        const subType = String.fromCharCode(data[subOffset+4],data[subOffset+5],data[subOffset+6],data[subOffset+7]);
                        if (subType === 'mvhd') {
                            const timescaleOffset = subOffset + 20;
                            const durationOffset = subOffset + 24;
                            const timescale = view.getUint32(timescaleOffset);
                            const durationUnits = Math.floor(duration * timescale);
                            view.setUint32(durationOffset, durationUnits);
                            console.log(`[RPlay] 头部时长注入成功: ${duration}s`);
                            return data;
                        }
                        subOffset += subSize;
                    }
                }
                offset += size;
            }
            return data;
        };

        let fileHandle;
        try {
          fileHandle = await window.showSaveFilePicker({
            suggestedName: fname,
            types: [{ description: 'MP4 Video File', accept: { 'video/mp4': ['.mp4'] } }],
          });
        } catch (err) {
          if (err.name === 'AbortError') return { success: false, error: '用户取消保存' };
          throw err;
        }

        writable = await fileHandle.createWritable();
        const transmuxer = new Mux.mp4.Transmuxer({ keepOriginalTimestamps: false }); 
        
        let mp4Buffer = [];
        let initSegmentWritten = false;

        transmuxer.on('data', (segment) => { mp4Buffer.push(segment); });

        let cryptoKey = null;
        let staticIv = null;
        if (keyUrl) {
          const keyResp = await fetch(keyUrl);
          if (!keyResp.ok) throw new Error("密钥下载失败"); // Fail fast
          const keyData = await keyResp.arrayBuffer();
          cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'AES-CBC' }, false, ['decrypt']);
          if (ivHex) {
             const hex = ivHex.replace('0x', '');
             const match = hex.match(/.{1,2}/g);
             if (match) staticIv = new Uint8Array(match.map(byte => parseInt(byte, 16)));
          }
        }

        let nextIndexToProcess = 0;     
        let currentIndexToFetch = 0;    
        let downloadedCache = new Map(); 
        let totalBytes = 0;
        let completedCount = 0;
        let isAborted = false; // 全局中断标志
        
        let lastReportTime = Date.now();
        let lastBytes = 0;
        const report = () => {
          const now = Date.now();
          if (now - lastReportTime >= 1000) {
            const speed = (totalBytes - lastBytes) / ((now - lastReportTime) / 1000);
            window.postMessage({
              type: 'RPLAY_DOWNLOAD_PROGRESS',
              tabId: bgTabId,
              completed: completedCount,
              total: urls.length,
              speed: speed
            }, '*');
            lastReportTime = now;
            lastBytes = totalBytes;
          }
        };

        const worker = async () => {
          while (currentIndexToFetch < urls.length) {
            if (isAborted) return; // 检查是否已终止

            const myIndex = currentIndexToFetch++; 
            const url = urls[myIndex];
            try {
              const resp = await fetch(url);
              if (!resp.ok) throw new Error(`HTTP ${resp.status}`); // 网络错误直接抛出

              let data = await resp.arrayBuffer();
              
              if (cryptoKey) {
                let iv;
                if (staticIv) {
                    iv = staticIv;
                } else {
                    const sequenceNumber = startSeq + myIndex;
                    iv = new Uint8Array(16);
                    new DataView(iv.buffer).setUint32(12, sequenceNumber, false); 
                }
                
                try {
                    data = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, cryptoKey, data);
                } catch (decryptErr) {
                    // 解密失败：严谨模式下直接抛出异常，不进行重试
                    throw new Error(`片段 ${myIndex} 解密失败: ${decryptErr.message}`);
                }
              }

              downloadedCache.set(myIndex, data);
              
              // 顺序处理
              while (downloadedCache.has(nextIndexToProcess)) {
                if (isAborted) return;

                const chunk = downloadedCache.get(nextIndexToProcess);
                downloadedCache.delete(nextIndexToProcess); 
                
                try {
                    transmuxer.push(new Uint8Array(chunk));
                    transmuxer.flush();

                    while (mp4Buffer.length > 0) {
                        const segment = mp4Buffer.shift();
                        if (segment.initSegment && !initSegmentWritten) {
                             const patchedInit = injectDuration(segment.initSegment, totalDuration);
                             await writable.write(patchedInit);
                             initSegmentWritten = true;
                        }
                        if (segment.data) await writable.write(segment.data);
                    }
                } catch (muxErr) { 
                    // 转码失败：直接抛出异常
                    throw new Error(`片段 ${nextIndexToProcess} 转码失败: ${muxErr.message}`);
                }
                
                totalBytes += chunk.byteLength;
                completedCount++;
                nextIndexToProcess++;
              }
              report();
            } catch (err) {
              isAborted = true; // 标记终止
              console.error(`片段 ${myIndex} 严重错误，终止下载`, err);
              throw err; // 向上传递错误，触发 Promise.all 的 reject
            }
          }
        };

        const promises = [];
        const actualLimit = Math.min(concurrentLimit, urls.length);
        for (let i = 0; i < actualLimit; i++) {
          promises.push(worker());
        }

        await Promise.all(promises);

        if (!isAborted) {
            while (mp4Buffer.length > 0) {
                 const segment = mp4Buffer.shift();
                 if (segment.data) await writable.write(segment.data);
            }
            transmuxer.off('data');
            await writable.close();
            return { success: true, totalBytes: totalBytes };
        } else {
            // 如果已终止，尝试关闭文件（虽然可能已经损坏）
            try { await writable.close(); } catch(e){}
            throw new Error("下载任务因错误被强制终止");
        }

      } catch (err) { 
          return { success: false, error: err.message }; 
      } finally {
		  if (writable) {
			  try {
				  await writable.close();
			  } catch (e) {
				  //console.warn("关闭文件流时出错 (可能已关闭):", e);
			  }
		  }
	  }
    },
    // 修复点：将 totalDuration 修改为 durationSec
    args: [tsUrls, aesKeyUrl, aesIvString, seqOffset, filename, tabId, limit, durationSec]
  }).then((results) => {
    if (results && results[0] && results[0].result && results[0].result.success) {
      const totalTime = (Date.now() - downloadStats[statsId].startTime) / 1000;
      const totalBytes = results[0].result.totalBytes || 0;
      updateDownloadState(tabId, { 
        status: 'completed', message: `下载完成！`, progress: 100,
        totalTime, avgSpeed: totalBytes > 0 ? totalBytes / totalTime : 0, downloadedSize: totalBytes
      });
      updateBadge('✓', '#28a745', tabId);
      broadcastMessage({ type: 'DOWNLOAD_COMPLETE', tabId, filename, state: downloadStates[tabId] });
      setTimeout(() => {
        updateBadge(videoInfo[tabId] ? videoInfo[tabId].length.toString() : '', '#667eea', tabId);
        delete downloadStates[tabId];
        delete downloadStats[statsId];
      }, 3000);
    } else {
      const error = results?.[0]?.result?.error || '未知错误';
      throw new Error(error);
    }
  }).catch((error) => {
    console.error('下载失败:', error);
    updateBadge('✗', '#dc3545', tabId);
    updateDownloadState(tabId, { status: 'error', message: error.message });
    broadcastMessage({ type: 'DOWNLOAD_ERROR', tabId, error: error.message, state: downloadStates[tabId] });
  });
}

function updateDownloadState(tabId, updates) {
  if (!downloadStates[tabId]) downloadStates[tabId] = {};
  Object.assign(downloadStates[tabId], updates);
  broadcastMessage({ type: 'DOWNLOAD_STATE_UPDATE', tabId, state: downloadStates[tabId] });
}
function broadcastMessage(message) {
  chrome.runtime.sendMessage(message).catch(() => {});
  if (message.tabId) chrome.tabs.sendMessage(message.tabId, message).catch(() => {});
}
function updateBadge(text, color, tabId) {
  if (tabId) {
    chrome.action.setBadgeText({ text, tabId });
    chrome.action.setBadgeBackgroundColor({ color, tabId });
  } else {
    chrome.action.setBadgeText({ text });
    chrome.action.setBadgeBackgroundColor({ color });
  }
}
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || (changeInfo.status === 'loading' && tab.url)) {
    const currentUrl = changeInfo.url || tab.url;
    const previousUrl = tabUrls[tabId];
    if (changeInfo.status === 'loading' || (previousUrl && previousUrl !== currentUrl)) {
      if (videoInfo[tabId]) { delete videoInfo[tabId]; chrome.storage.local.remove(tabId.toString()); }
      updateBadge('', '#666666', tabId);
      if (downloadStates[tabId]) delete downloadStates[tabId];
    }
    tabUrls[tabId] = currentUrl;
  }
});
chrome.tabs.onRemoved.addListener((tabId) => {
  if (videoInfo[tabId]) chrome.storage.local.remove(tabId.toString());
  delete videoInfo[tabId];
  delete downloadStates[tabId];
  delete tabUrls[tabId];
});

console.log('RPlay Video Downloader (Fail-Fast Mode) loaded');