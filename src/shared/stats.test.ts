import { describe, expect, it } from 'vitest';
import { createEmptyDailyStats } from './defaults';
import { createStatsOverview } from './stats';
import type { DailyStats } from './types';

describe('stats overview', () => {
  it('aggregates day, current week, and current month', () => {
    const overview = createStatsOverview(
      {
        '2026-06-01': stats({ reminders: 1, completed: 1, skipped: 0 }),
        '2026-06-07': stats({ reminders: 2, completed: 1, skipped: 1 }),
        '2026-06-08': stats({ reminders: 3, completed: 2, skipped: 1 }),
        '2026-06-09': stats({ reminders: 4, completed: 4, skipped: 0 })
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
        '2026-06-01': stats({ reminders: 1, completed: 1, skipped: 0 }),
        '2026-06-07': stats({ reminders: 2, completed: 1, skipped: 1 })
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

  it('uses the persisted event-order streak instead of deriving it from totals', () => {
    const day = {
      ...stats({ reminders: 4, completed: 3, skipped: 1 }),
      currentCompletionStreak: 0
    } as DailyStats;

    const overview = createStatsOverview({
      '2026-06-08': day
    }, new Date('2026-06-08T12:00:00'));

    expect(overview.day.currentCompletionStreak).toBe(0);
  });

  it('counts a day with recorded focus time as active before any reminder fires', () => {
    const overview = createStatsOverview({
      '2026-06-08': stats({ longestFocusSeconds: 20 * 60 })
    }, new Date('2026-06-08T12:00:00'));

    expect(overview.day.activeDays).toBe(1);
  });
});

function stats(patch: Partial<DailyStats>): DailyStats {
  return {
    ...createEmptyDailyStats(),
    ...patch
  };
}
