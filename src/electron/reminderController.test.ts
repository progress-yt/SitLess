import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultSettings, createEmptyDailyStats, createEmptyDaySession, createEmptyRuntimeState, createFallbackDailyPoem } from '../shared/defaults';
import { getDateKey } from '../shared/schedule';
import { createStatsOverview, type DailyStatsFile } from '../shared/stats';
import type { DailyPoem, DailyStats, DaySession, ReminderRuntimeState } from '../shared/types';
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

describe('overtime auto end', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-10T18:30:00'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not reuse the active-mode idle reset threshold for auto clock-out', () => {
    const stores = createControllerStores();
    stores.settings.idleResetMinutes = 5;
    stores.settings.autoEndIdleMinutes = 60;
    const controller = createController(stores, () => 10 * 60);

    controller.refresh();

    expect(controller.getSnapshot().status).toBe('idle-reset');
    expect(stores.daySessionStore.getToday().status).toBe('working');
  });

  it('ends the workday after the dedicated overtime idle threshold', () => {
    const stores = createControllerStores();
    stores.settings.autoEndIdleMinutes = 60;
    const controller = createController(stores, () => 61 * 60);

    controller.refresh();

    expect(controller.getSnapshot().status).toBe('off-work');
    expect(stores.daySessionStore.getToday().status).toBe('off-work');
  });
});

// Pin time to a weekday within work hours so the schedule gate allows reminders.
const FAKE_WEEKDAY = new Date('2026-06-10T10:00:00');

describe('reminder pause flow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FAKE_WEEKDAY);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

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
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FAKE_WEEKDAY);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

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

describe('snoozed reminder stats', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FAKE_WEEKDAY);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not count a snoozed re-alert as a new reminder, but still counts the outcome', () => {
    const stores = createControllerStores();
    const controller = createController(stores);

    controller.refresh();
    (controller as unknown as { cycleStartedAt: number | null }).cycleStartedAt = Date.now() - 46 * 60 * 1000;
    controller.refresh();
    expect(stores.statsStore.getToday().reminders).toBe(1);

    controller.handleCountdownAction('snooze');
    vi.setSystemTime(new Date(FAKE_WEEKDAY.getTime() + stores.settings.snoozeMinutes * 60 * 1000 + 1000));
    controller.refresh();

    expect(controller.getSnapshot().status).toBe('countdown');
    expect(stores.statsStore.getToday().reminders).toBe(1);

    controller.handleCountdownAction('skip');
    expect(stores.statsStore.getToday()).toMatchObject({
      reminders: 1,
      skipped: 1
    });
  });
});

describe('snapshot record cache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FAKE_WEEKDAY);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('refreshes daily records after a same-day correction', () => {
    const stores = createControllerStores();
    const controller = createController(stores);
    const dateKey = getDateKey(FAKE_WEEKDAY);

    controller.refresh();
    const snapshot = controller.updateDailyRecord({
      dateKey,
      workStatus: 'working',
      workStartedAtIso: FAKE_WEEKDAY.toISOString(),
      workEndedAtIso: null,
      reminders: 3,
      completed: 2,
      skipped: 1
    });

    expect(snapshot.dailyRecords[0]).toMatchObject({
      dateKey,
      workStatus: 'working',
      reminders: 3,
      completed: 2,
      skipped: 1
    });
  });

  it('clamps impossible manual record counts', () => {
    const stores = createControllerStores();
    const controller = createController(stores);
    const dateKey = getDateKey(FAKE_WEEKDAY);

    const snapshot = controller.updateDailyRecord({
      dateKey,
      workStatus: 'working',
      workStartedAtIso: FAKE_WEEKDAY.toISOString(),
      workEndedAtIso: null,
      reminders: 2,
      completed: 4,
      skipped: 4
    });

    expect(snapshot.dailyRecords[0]).toMatchObject({
      dateKey,
      reminders: 2,
      completed: 2,
      skipped: 0,
      completionRate: 1
    });
  });

  it('refreshes daily records and overview when the date changes', () => {
    const stores = createControllerStores();
    const controller = createController(stores);
    const nextWeekday = new Date('2026-06-11T10:00:00');

    controller.refresh();
    expect(controller.getSnapshot().dailyRecords[0].dateKey).toBe(getDateKey(FAKE_WEEKDAY));

    vi.setSystemTime(nextWeekday);
    controller.refresh();

    const snapshot = controller.getSnapshot();
    expect(snapshot.dailyRecords[0].dateKey).toBe(getDateKey(nextWeekday));
    expect(snapshot.statsOverview.day.startDateKey).toBe(getDateKey(nextWeekday));
  });
});

describe('daily poem refresh', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FAKE_WEEKDAY);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('forces a manual refresh and exposes the cooldown in the snapshot', async () => {
    const stores = createControllerStores();
    const dateKey = getDateKey(FAKE_WEEKDAY);
    const remotePoem: DailyPoem = {
      dateKey,
      content: '手动刷新后的诗句',
      author: '测试',
      title: '刷新',
      source: 'jinrishici'
    };
    stores.poemStore.refreshToday = async (_date = new Date(), options) => {
      stores.poemRefreshCalls.push({ force: options?.force ?? false });
      stores.poem = remotePoem;
      return remotePoem;
    };

    const controller = createController(stores);
    const result = await controller.refreshDailyPoem();

    expect(result.status).toBe('refreshed');
    expect(stores.poemRefreshCalls).toEqual([{ force: true }]);
    expect(result.snapshot.dailyPoem?.content).toBe(remotePoem.content);
    expect(result.snapshot.dailyPoemRefresh.canRefresh).toBe(false);
    expect(result.snapshot.dailyPoemRefresh.retryAfterSeconds).toBe(60);
  });

  it('rate limits repeated manual refreshes', async () => {
    const stores = createControllerStores();
    const controller = createController(stores);

    await controller.refreshDailyPoem();
    const second = await controller.refreshDailyPoem();

    expect(second.status).toBe('rate-limited');
    expect(second.retryAfterSeconds).toBe(60);
    expect(stores.poemRefreshCalls).toHaveLength(1);

    vi.advanceTimersByTime(60 * 1000);
    const third = await controller.refreshDailyPoem();

    expect(third.status).toBe('fallback');
    expect(stores.poemRefreshCalls).toHaveLength(2);
  });
});

function createController(stores: ReturnType<typeof createControllerStores>, getIdleSeconds = () => 0): ReminderController {
  return new ReminderController(
    stores.settingsStore,
    stores.statsStore,
    stores.daySessionStore,
    stores.runtimeStateStore,
    stores.poemStore,
    {
      getIdleSeconds,
      showNotification: () => undefined,
      confirmWorkdayStart: async () => true,
      openCountdown: () => undefined,
      closeCountdown: () => undefined,
      openFullscreen: () => undefined,
      closeFullscreen: () => undefined
    }
  );
}

function createControllerStores() {
  const settings = createDefaultSettings();
  const stats: DailyStatsFile = {};
  let runtimeState: ReminderRuntimeState = createEmptyRuntimeState();
  let daySession: DaySession = {
    ...createEmptyDaySession(),
    status: 'working',
    startedAtIso: new Date().toISOString()
  };
  let poem = createFallbackDailyPoem(getDateKey(new Date()));
  const poemRefreshCalls: Array<{ force: boolean }> = [];

  return {
    settings,
    get poem() {
      return poem;
    },
    set poem(next: DailyPoem) {
      poem = next;
    },
    poemRefreshCalls,
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
      end: (date = new Date()) => {
        daySession = {
          ...daySession,
          status: 'off-work',
          endedAtIso: date.toISOString()
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
      getToday: (date = new Date()) => poem.dateKey === getDateKey(date) ? poem : createFallbackDailyPoem(getDateKey(date)),
      refreshToday: async (date = new Date(), options?: { force?: boolean }) => {
        poemRefreshCalls.push({ force: options?.force ?? false });
        poem = createFallbackDailyPoem(getDateKey(date));
        return poem;
      }
    }
  };
}
