import { describe, expect, it } from 'vitest';
import { createSourceId, estimateMediaBytes } from '../src/media.js';
import { BACKGROUND_MESSAGE_TYPES, MessageType, TaskPhase, canTransitionTask } from '../src/protocol.js';

describe('shared task protocol', () => {
  it('defines a media-clear notification without treating it as a background request', () => {
    expect(MessageType.VIDEO_INFO_CLEARED).toBe('VIDEO_INFO_CLEARED');
    expect(BACKGROUND_MESSAGE_TYPES.has(MessageType.VIDEO_INFO_CLEARED)).toBe(false);
  });

  it('allows only valid task phase transitions', () => {
    expect(canTransitionTask(TaskPhase.QUEUED, TaskPhase.PREPARING)).toBe(true);
    expect(canTransitionTask(TaskPhase.REMUXING, TaskPhase.FALLBACK_TS)).toBe(true);
    expect(canTransitionTask(TaskPhase.SAVING, TaskPhase.COMPLETED)).toBe(true);
    expect(canTransitionTask(TaskPhase.QUEUED, TaskPhase.COMPLETED)).toBe(false);
    expect(canTransitionTask(TaskPhase.COMPLETED, TaskPhase.PREPARING)).toBe(false);
  });

  it('creates stable source IDs without exposing the signed URL', () => {
    const master = 'https://api.example/master?token=secret';
    const stream = 'https://cdn.example/video.m3u8?signature=private';
    const sourceId = createSourceId(master, stream);

    expect(createSourceId(master, stream)).toBe(sourceId);
    expect(createSourceId(master, `${stream}2`)).not.toBe(sourceId);
    expect(sourceId).not.toContain('secret');
    expect(sourceId).not.toContain('private');
  });

  it('uses one shared media size estimate', () => {
    expect(estimateMediaBytes(8_000_000, 10)).toBe(6_800_000);
    expect(estimateMediaBytes(0, 10)).toBeNull();
  });
});
