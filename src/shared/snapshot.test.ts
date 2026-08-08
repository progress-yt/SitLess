import { describe, expect, it } from 'vitest';
import type { AppSnapshot } from './types';
import { toRealtimeSnapshot } from './snapshot';

describe('realtime snapshot', () => {
  it('omits history payloads from frequent updates', () => {
    const snapshot = {
      nowIso: '2026-08-08T00:00:00.000Z',
      dailyRecords: [{ dateKey: '2026-08-08' }],
      trend: [{ dateKey: '2026-08-08' }]
    } as unknown as AppSnapshot;

    expect(toRealtimeSnapshot(snapshot)).toEqual({ nowIso: '2026-08-08T00:00:00.000Z' });
  });
});
