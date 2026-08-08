import { describe, expect, it } from 'vitest';
import { createScheduleOverrideDraft } from './scheduleOverrideDraft';

describe('settings date defaults', () => {
  it('uses the local calendar date instead of the UTC date', () => {
    const date = new Date('2026-06-10T00:30:00+08:00');

    expect(createScheduleOverrideDraft(date).dateKey).toBe('2026-06-10');
  });
});
