import { describe, expect, it } from 'vitest';
import { createDefaultSettings, createEmptyDailyStats, createEmptyDaySession, createEmptyRuntimeState, createFallbackDailyPoem } from '../shared/defaults';
import { getDateKey } from '../shared/schedule';
import { createStatsOverview, type DailyStatsFile } from '../shared/stats';
import type { DailyStats, DaySession, ReminderRuntimeState } from '../shared/types';
import { ReminderController, shouldPromptWorkdayStart } from './reminderController';

describe('workday start prompt schedule', () => {
  it('does not prompt before 08:30 on a weekday', () => {
    expect(shouldPromptWorkdayStart(new Date('2026-06-05T08:29:00'))).toBe(false);
  });

  it('prompts from 08:30 on a weekday', () => {
    expect(shouldPromptWorkdayStart(new Date('2026-06-05T08:30:00'))).toBe(true);
  });

  it('does not prompt on weekends', () => {
    expect(shouldPromptWorkdayStart(new Date('2026-06-06T09:00:00'))).toBe(false);
  });
});

describe('reminder pause flow', () => {
  it('can resume reminders before a pause expires', () => {
    const stores = createControllerStores();
    const controller = new ReminderController(
      stores.settingsStore,
      stores.statsStore,
      stores.daySessionStore,
      stores.runtimeStateStore,
      stores.poemStore,
      {
        getIdleSeconds: () => 0,
        showNotification: () => undefined,
        confirmWorkdayStart: async () => true,
        openCountdown: () => undefined,
        closeCountdown: () => undefined,
        openFullscreen: () => undefined,
        closeFullscreen: () => undefined
      }
    );

    const paused = controller.pauseForHour();
    expect(paused.status).toBe('paused');
    expect(paused.pauseUntilIso).not.toBeNull();

    const resumed = controller.resumeReminders();
    expect(resumed.status).toBe('counting');
    expect(resumed.pauseUntilIso).toBeNull();
    expect(stores.runtimeStateStore.get().pauseUntilIso).toBeNull();
  });
});

function createControllerStores() {
  const settings = createDefaultSettings();
  const stats: DailyStatsFile = {};
  let runtimeState: ReminderRuntimeState = createEmptyRuntimeState();
  let daySession: DaySession = {
    ...createEmptyDaySession(),
    status: 'working',
    startedAtIso: new Date().toISOString()
  };

  return {
    settingsStore: {
      get: () => settings
    },
    statsStore: {
      getToday: (date = new Date()): DailyStats => ({
        ...createEmptyDailyStats(),
        ...stats[getDateKey(date)]
      }),
      getOverview: (date = new Date()) => createStatsOverview(stats, date),
      getRecentDays: () => stats,
      setDay: (dateKey: string, next: DailyStats): DailyStats => {
        stats[dateKey] = next;
        return next;
      },
      increment: (field: 'reminders' | 'completed' | 'skipped', date = new Date()): DailyStats => {
        const key = getDateKey(date);
        const current = {
          ...createEmptyDailyStats(),
          ...stats[key]
        };
        current[field] += 1;
        stats[key] = current;
        return current;
      }
    },
    daySessionStore: {
      getToday: () => daySession,
      getRecentDays: () => ({
        [getDateKey(new Date())]: daySession
      }),
      setDay: (_dateKey: string, next: DaySession) => {
        daySession = next;
        return daySession;
      },
      start: () => {
        daySession = {
          ...daySession,
          status: 'working',
          startedAtIso: daySession.startedAtIso ?? new Date().toISOString(),
          endedAtIso: null
        };
        return daySession;
      },
      end: () => {
        daySession = {
          ...daySession,
          status: 'off-work',
          endedAtIso: new Date().toISOString()
        };
        return daySession;
      },
      markStartPrompted: () => {
        daySession = {
          ...daySession,
          startPromptedAtIso: new Date().toISOString()
        };
        return daySession;
      }
    },
    runtimeStateStore: {
      get: () => runtimeState,
      setPauseUntil: (date: Date | null) => {
        runtimeState = {
          ...runtimeState,
          pauseUntilIso: date?.toISOString() ?? null
        };
        return runtimeState;
      },
      muteToday: (date = new Date()) => {
        runtimeState = {
          ...runtimeState,
          mutedDateKey: getDateKey(date)
        };
        return runtimeState;
      },
      clearMute: () => {
        runtimeState = {
          ...runtimeState,
          mutedDateKey: null
        };
        return runtimeState;
      }
    },
    poemStore: {
      getToday: (date = new Date()) => createFallbackDailyPoem(getDateKey(date)),
      refreshToday: async (date = new Date()) => createFallbackDailyPoem(getDateKey(date))
    }
  };
}
