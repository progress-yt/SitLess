import { describe, expect, it } from 'vitest';
import { createStatsOverview } from './stats';

describe('stats overview', () => {
  it('aggregates day, current week, and current month', () => {
    const overview = createStatsOverview(
      {
        '2026-06-01': { reminders: 1, completed: 1, skipped: 0 },
        '2026-06-07': { reminders: 2, completed: 1, skipped: 1 },
        '2026-06-08': { reminders: 3, completed: 2, skipped: 1 },
        '2026-06-09': { reminders: 4, completed: 4, skipped: 0 }
      },
      new Date('2026-06-08T12:00:00')
    );

    expect(overview.day).toMatchObject({
      reminders: 3,
      completed: 2,
      skipped: 1,
      activeDays: 1,
      completionRate: 2 / 3
    });
    expect(overview.week).toMatchObject({
      startDateKey: '2026-06-08',
      endDateKey: '2026-06-08',
      reminders: 3,
      completed: 2,
      skipped: 1,
      activeDays: 1
    });
    expect(overview.month).toMatchObject({
      startDateKey: '2026-06-01',
      endDateKey: '2026-06-08',
      reminders: 6,
      completed: 4,
      skipped: 2,
      activeDays: 3
    });
  });

  it('starts a Sunday week on the previous Monday', () => {
    const overview = createStatsOverview(
      {
        '2026-06-01': { reminders: 1, completed: 1, skipped: 0 },
        '2026-06-07': { reminders: 2, completed: 1, skipped: 1 }
      },
      new Date('2026-06-07T12:00:00')
    );

    expect(overview.week).toMatchObject({
      startDateKey: '2026-06-01',
      endDateKey: '2026-06-07',
      reminders: 3,
      completed: 2,
      skipped: 1,
      activeDays: 2
    });
  });
});
