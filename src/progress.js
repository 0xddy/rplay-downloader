import { MessageType, TaskPhase } from './protocol.js';

export class ProgressReporter {
  constructor(task) {
    this.task = task;
    this.phase = TaskPhase.PREPARING;
    this.message = '正在读取 HLS 信息…';
    this.downloadedBytes = 0;
    this.totalBytes = task.estimatedBytes || null;
    this.mediaProgress = 0;
    this.lastReportAt = performance.now();
    this.lastReportBytes = 0;
    this.speed = 0;
  }

  setPhase(phase, message, extras = {}) {
    this.phase = phase;
    this.message = message;
    if (extras.totalBytes !== undefined) this.totalBytes = extras.totalBytes;
    if (extras.mediaProgress !== undefined) this.mediaProgress = extras.mediaProgress;
    this.report(true, extras);
  }

  addBytes(byteLength) {
    this.downloadedBytes += byteLength;
    this.report(false);
  }

  notePacket(timestamp, duration) {
    if (Number.isFinite(duration) && duration > 0) {
      this.mediaProgress = Math.max(this.mediaProgress, Math.max(0, timestamp) / duration);
    }
    this.report(false);
  }

  noteFallbackSegment(completed, total) {
    this.mediaProgress = total > 0 ? completed / total : 0;
    this.message = `正在回退下载原始 TS（${completed}/${total}）`;
    this.report(false);
  }

  report(force, extras = {}) {
    const now = performance.now();
    const elapsed = (now - this.lastReportAt) / 1000;
    if (!force && elapsed < 1) return;
    if (elapsed > 0) {
      this.speed = (this.downloadedBytes - this.lastReportBytes) / elapsed;
    }
    this.lastReportAt = now;
    this.lastReportBytes = this.downloadedBytes;

    const byteProgress = this.totalBytes
      ? Math.min(1, this.downloadedBytes / this.totalBytes)
      : 0;
    const effectiveProgress = this.phase === TaskPhase.FALLBACK_TS
      ? this.mediaProgress
      : Math.max(byteProgress, this.mediaProgress);
    const progress = this.phase === TaskPhase.PREPARING
      ? Math.min(5, Math.round(byteProgress * 5))
      : Math.min(95, Math.round(effectiveProgress * 95));

    chrome.runtime.sendMessage({
      type: MessageType.OFFSCREEN_PROGRESS,
      taskId: this.task.taskId,
      updates: {
        phase: this.phase,
        message: this.message,
        downloadedBytes: this.downloadedBytes,
        totalBytes: this.totalBytes,
        speed: this.speed,
        progress,
        ...extras,
      },
    }).catch(() => {});
  }
}
