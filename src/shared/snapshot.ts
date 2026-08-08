import type { AppSnapshot, RealtimeSnapshot } from './types';

export function toRealtimeSnapshot(snapshot: AppSnapshot): RealtimeSnapshot {
  const { dailyRecords: _dailyRecords, trend: _trend, ...realtime } = snapshot;
  return realtime;
}
