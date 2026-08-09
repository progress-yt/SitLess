import { describe, expect, it } from 'vitest';
import { createScheduleOverrideDraft } from './scheduleOverrideDraft';

describe('settings date defaults', () => {
  it('uses the supplied date local calendar components', () => {
    const date = new Date(2026, 5, 10, 0, 30);

    expect(createScheduleOverrideDraft(date).dateKey).toBe('2026-06-10');
  });
});
