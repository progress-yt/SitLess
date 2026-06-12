import { describe, expect, it } from 'vitest';
import { createDefaultSettings, createEmptyDailyStats, createEmptyDaySession, createEmptyRuntimeState, createFallbackDailyPoem } from '../shared/defaults';
import { getDateKey } from '../shared/schedule';
import { createStatsOverview, type DailyStatsFile } from '../shared/stats';
import type { DailyStats, DaySession, ReminderRuntimeState } from '../shared/types';
import { ReminderController, getOvertimeEndDate, shouldPromptWorkdayStart } from './reminderController';

describe('workday start prompt schedule', () => {
  it('does not prompt before the configured work start on a weekday', () => {
    const settings = createDefaultSettings();
    settings.workSchedule.start = '10:00';

    expect(shouldPromptWorkdayStart(new Date('2026-06-05T09:59:00'), settings)).toBe(false);
  });

  it('prompts from the configured work start on a weekday', () => {
    const settings = createDefaultSettings();
    settings.workSchedule.start = '10:00';

    expect(shouldPromptWorkdayStart(new Date('2026-06-05T10:00:00'), settings)).toBe(true);
  });

  it('does not prompt during lunch break', () => {
    const settings = createDefaultSettings();

    expect(shouldPromptWorkdayStart(new Date('2026-06-05T12:30:00'), settings)).toBe(false);
  });

  it('does not prompt after the configured work end', () => {
    const settings = createDefaultSettings();

    expect(shouldPromptWorkdayStart(new Date('2026-06-05T18:30:00'), settings)).toBe(false);
  });

  it('does not prompt on weekends', () => {
    expect(shouldPromptWorkdayStart(new Date('2026-06-06T10:00:00'), createDefaultSettings())).toBe(false);
  });
});

describe('overtime end time', () => {
  it('uses the last active time after the configured end time', () => {
    const settings = createDefaultSettings();
    const endedAt = getOvertimeEndDate(new Date('2026-06-05T19:30:00'), settings, 10 * 60);

    expect(endedAt.toISOString()).toBe(new Date('2026-06-05T19:20:00').toISOString());
  });

  it('does not record an overtime end before the configured end time', () => {
    const settings = createDefaultSettings();
    const endedAt = getOvertimeEndDate(new Date('2026-06-05T18:30:00'), settings, 2 * 60 * 60);

    expect(endedAt.toISOString()).toBe(new Date('2026-06-05T18:00:00').toISOString());
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

describe('reminder mode changes', () => {
  it('restarts the current cycle when switching modes', () => {
    const stores = createControllerStores();
    stores.settings.mode = 'active';
    stores.settings.fixedIntervalMinutes = 45;
    let openedCountdown = 0;
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
        openCountdown: () => {
          openedCountdown += 1;
        },
        closeCountdown: () => undefined,
        openFullscreen: () => undefined,
        closeFullscreen: () => undefined
      }
    );

    controller.refresh();
    (controller as unknown as { cycleStartedAt: number | null }).cycleStartedAt = Date.now() - 46 * 60 * 1000;

    const previous = { ...stores.settings };
    stores.settings.mode = 'fixed';
    const snapshot = controller.handleSettingsChange(previous, stores.settings);

    expect(snapshot.status).toBe('counting');
    expect(snapshot.remainingSeconds ?? 0).toBeGreaterThan(44 * 60);
    expect(openedCountdown).toBe(0);
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
    settings,
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
