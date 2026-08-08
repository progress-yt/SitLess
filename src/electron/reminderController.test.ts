import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultSettings, createEmptyDailyStats, createEmptyDaySession, createEmptyRuntimeState, createFallbackDailyPoem } from '../shared/defaults';
import { getDateKey } from '../shared/schedule';
import { createStatsOverview, type DailyStatsFile } from '../shared/stats';
import type { DailyPoem, DailyStats, DaySession, ReminderRuntimeState } from '../shared/types';
import type { ReminderClock, ReminderTimerHandle } from './reminderClock';
import { ReminderController, getOvertimeEndDate, shouldPromptWorkdayStart } from './reminderController';

describe('workday start prompt schedule', () => {
  it('does not prompt before the configured work start on a weekday', () => {
    const settings = createDefaultSettings();
    settings.weeklySchedule.friday.start = '10:00';

    expect(shouldPromptWorkdayStart(new Date('2026-06-05T09:59:00'), settings)).toBe(false);
  });

  it('prompts from the configured work start on a weekday', () => {
    const settings = createDefaultSettings();
    settings.weeklySchedule.friday.start = '10:00';

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
    stores.settings.overtimeAutoEndMinutes = 60;
    const controller = createController(stores, {
      getIdleSeconds: () => 10 * 60
    });

    controller.refresh();

    expect(controller.getSnapshot().status).toBe('idle-reset');
    expect(stores.daySessionStore.getToday().status).toBe('working');
  });

  it('ends the workday after the dedicated overtime idle threshold', () => {
    const stores = createControllerStores();
    stores.settings.overtimeAutoEndMinutes = 60;
    const controller = createController(stores, {
      getIdleSeconds: () => 61 * 60
    });

    controller.refresh();

    expect(controller.getSnapshot().status).toBe('off-work');
    expect(stores.daySessionStore.getToday().status).toBe('off-work');
  });

  it('closes the owning workday when an overtime session crosses midnight', () => {
    const workday = new Date('2026-06-10T23:59:50');
    const nextDay = new Date('2026-06-11T00:00:01');
    const clock = new ManualReminderClock(workday);
    const stores = createControllerStores(clock.now);
    const sessions: Record<string, DaySession> = {
      [getDateKey(workday)]: {
        ...createEmptyDaySession(),
        status: 'working',
        startedAtIso: workday.toISOString()
      }
    };
    stores.daySessionStore.getToday = (date = clock.now()) => sessions[getDateKey(date)] ?? createEmptyDaySession();
    stores.daySessionStore.getRecentDays = () => sessions;
    stores.daySessionStore.setDay = (dateKey, session) => {
      sessions[dateKey] = session;
      return session;
    };
    const controller = createController(stores, {}, clock);

    controller.refresh();
    clock.advanceBy(11 * 1000);
    controller.refresh();

    expect(sessions[getDateKey(workday)]).toMatchObject({
      status: 'off-work',
      endedAtIso: new Date('2026-06-11T00:00:00').toISOString()
    });
    expect(controller.getSnapshot()).toMatchObject({
      nowIso: nextDay.toISOString(),
      status: 'outside-schedule'
    });
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
        confirmWorkdayStart: async () => 'start',
        openCountdown: () => undefined,
        closeCountdown: () => undefined,
        openFullscreen: () => undefined,
        closeFullscreen: () => undefined,
        isImageFallbackActive: () => false
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

  it('records the current focus duration before pausing', () => {
    const stores = createControllerStores();
    const controller = createController(stores);

    controller.refresh();
    vi.setSystemTime(new Date(FAKE_WEEKDAY.getTime() + 20 * 60 * 1000));
    controller.pauseForHour();

    expect(stores.statsStore.getToday().longestFocusSeconds).toBe(20 * 60);
  });

  it('clamps non-finite focus durations before persisting them', () => {
    const stores = createControllerStores();
    const controller = createController(stores);

    expect(() => controller.focusForMinutes(Number.POSITIVE_INFINITY)).not.toThrow();
    expect(controller.getSnapshot().remainingSeconds).toBe(240 * 60);
  });
});

describe('runtime recovery and focus context', () => {
  it('continues a persisted reminder cycle after restart', () => {
    const clock = new ManualReminderClock(new Date('2026-06-10T10:00:00'));
    const stores = createControllerStores(clock.now);
    stores.runtimeState = {
      ...createEmptyRuntimeState(),
      cycleStartedAtIso: new Date('2026-06-10T09:30:00').toISOString()
    };

    const controller = createController(stores, {}, clock);
    controller.refresh();

    expect(controller.getSnapshot()).toMatchObject({ status: 'counting', remainingSeconds: 15 * 60 });
  });

  it('reopens an interrupted reminder as a normal countdown', () => {
    const clock = new ManualReminderClock(new Date('2026-06-10T10:00:00'));
    const stores = createControllerStores(clock.now);
    stores.runtimeState = {
      ...createEmptyRuntimeState(),
      reminderStartedAtIso: new Date('2026-06-10T09:59:00').toISOString(),
      reminderPhase: 'pending'
    };
    let countdownOpens = 0;
    const controller = createController(stores, { openCountdown: () => { countdownOpens += 1; } }, clock);

    controller.refresh();

    expect(controller.getSnapshot().status).toBe('countdown');
    expect(countdownOpens).toBe(1);
  });

  it('pauses reminder accumulation while a meeting app is active', () => {
    const clock = new ManualReminderClock(new Date('2026-06-10T10:00:00'));
    const stores = createControllerStores(clock.now);
    const controller = createController(stores, {
      getFocusContext: () => ({ active: true, reason: 'meeting-app', appName: 'Teams' })
    }, clock);

    controller.refresh();

    expect(controller.getSnapshot()).toMatchObject({
      status: 'context-paused',
      focusContext: { active: true, reason: 'meeting-app', appName: 'Teams' }
    });
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
        confirmWorkdayStart: async () => 'start',
        openCountdown: () => {
          openedCountdown += 1;
        },
        closeCountdown: () => undefined,
        openFullscreen: () => undefined,
        closeFullscreen: () => undefined,
        isImageFallbackActive: () => false
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
      snoozed: 1,
      skipped: 1
    });
  });

  it('does not replace a real snoozed reminder with a test reminder', () => {
    const stores = createControllerStores();
    const controller = createController(stores);

    controller.refresh();
    (controller as unknown as { cycleStartedAt: number | null }).cycleStartedAt = Date.now() - 46 * 60 * 1000;
    controller.refresh();
    controller.handleCountdownAction('snooze');

    controller.testReminderFlow();
    expect(controller.getSnapshot().status).toBe('snoozed');

    vi.setSystemTime(new Date(FAKE_WEEKDAY.getTime() + stores.settings.snoozeMinutes * 60 * 1000 + 1000));
    controller.refresh();
    expect(controller.getSnapshot().status).toBe('countdown');
    controller.handleCountdownAction('skip');

    expect(stores.statsStore.getToday()).toMatchObject({
      reminders: 1,
      snoozed: 1,
      skipped: 1
    });
  });
});

describe('countdown timing', () => {
  it('keeps the active countdown deadline when settings change', () => {
    const clock = new ManualReminderClock(FAKE_WEEKDAY);
    const stores = createControllerStores(clock.now);
    stores.settings.activeThresholdMinutes = 1;
    stores.settings.countdownSeconds = 10;
    const controller = createController(stores, {}, clock);

    controller.refresh();
    clock.advanceBy(61 * 1000);
    controller.refresh();
    expect(controller.getSnapshot()).toMatchObject({
      status: 'countdown',
      remainingSeconds: 10
    });

    clock.advanceBy(3 * 1000);
    const previous = { ...stores.settings };
    stores.settings.countdownSeconds = 120;
    controller.handleSettingsChange(previous, stores.settings);

    expect(controller.getSnapshot()).toMatchObject({
      status: 'countdown',
      remainingSeconds: 7,
      countdownDurationSeconds: 10
    });
  });
});

describe('fullscreen rest flow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FAKE_WEEKDAY);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('only counts a completed rest after the minimum rest time', () => {
    const stores = createControllerStores();
    stores.settings.activeThresholdMinutes = 1;
    stores.settings.minimumRestSeconds = 60;
    const controller = createController(stores);

    controller.refresh();
    const dueAt = new Date(FAKE_WEEKDAY.getTime() + 61 * 1000);
    vi.setSystemTime(dueAt);
    controller.refresh();

    expect(controller.getSnapshot().status).toBe('countdown');
    expect(stores.statsStore.getToday(dueAt).reminders).toBe(1);

    controller.handleCountdownAction('start-rest');
    expect(controller.getSnapshot().fullscreenRest).toMatchObject({
      phase: 'resting',
      remainingSeconds: 60,
      canComplete: false
    });

    controller.completeRest();
    expect(controller.getSnapshot().status).toBe('fullscreen');
    expect(stores.statsStore.getToday(dueAt).completed).toBe(0);

    vi.setSystemTime(new Date(dueAt.getTime() + 60 * 1000));
    controller.refresh();
    expect(controller.getSnapshot().fullscreenRest).toMatchObject({
      phase: 'ready',
      remainingSeconds: 0,
      canComplete: true
    });

    controller.completeRest();
    expect(controller.getSnapshot()).toMatchObject({
      status: 'counting',
      currentCompletionStreak: 1
    });
    expect(stores.statsStore.getToday(dueAt)).toMatchObject({
      reminders: 1,
      completed: 1,
      restSeconds: 60,
      longestFocusSeconds: 61
    });
  });

  it('opens timed-out fullscreen reminders as a prompt and can interrupt without completion', () => {
    const stores = createControllerStores();
    stores.settings.minimumRestSeconds = 45;
    stores.settings.snoozeMinutes = 10;
    stores.settings.activeThresholdMinutes = 1;
    const controller = createController(stores);

    controller.refresh();
    vi.setSystemTime(new Date(FAKE_WEEKDAY.getTime() + 61 * 1000));
    controller.refresh();
    controller.handleCountdownAction('timeout');

    expect(controller.getSnapshot().fullscreenRest).toMatchObject({
      phase: 'prompt',
      startedAtIso: null,
      remainingSeconds: 45,
      canComplete: false
    });

    controller.startRest();
    expect(controller.getSnapshot().fullscreenRest).toMatchObject({
      phase: 'resting',
      remainingSeconds: 45
    });

    controller.interruptRest();
    const snapshot = controller.getSnapshot();
    expect(snapshot.status).toBe('snoozed');
    expect(snapshot.remainingSeconds).toBe(10 * 60);
    expect(stores.statsStore.getToday()).toMatchObject({
      reminders: 1,
      completed: 0,
      skipped: 0,
      interrupted: 1
    });
  });

  it('does not change completion streaks when completing a test reminder', () => {
    const stores = createControllerStores();
    stores.settings.minimumRestSeconds = 10;
    const controller = createController(stores);

    controller.testReminderFlow();
    controller.handleCountdownAction('start-rest');
    vi.setSystemTime(new Date(FAKE_WEEKDAY.getTime() + 10 * 1000));
    controller.refresh();
    controller.completeRest();

    expect(controller.getSnapshot().currentCompletionStreak).toBe(0);
    expect(stores.statsStore.getToday().completed).toBe(0);
  });

  it('attributes a rest completed after midnight to the reminder date', () => {
    const reminderDay = new Date('2026-06-10T23:58:00');
    const nextDay = new Date('2026-06-11T00:00:01');
    const clock = new ManualReminderClock(reminderDay);
    const stores = createControllerStores(clock.now);
    stores.settings.activeThresholdMinutes = 1;
    stores.settings.minimumRestSeconds = 60;
    const controller = createController(stores, {}, clock);

    controller.refresh();
    clock.advanceBy(61 * 1000);
    controller.refresh();
    controller.handleCountdownAction('start-rest');
    clock.advanceBy(60 * 1000);
    controller.refresh();
    controller.completeRest();

    expect(stores.statsStore.getToday(reminderDay)).toMatchObject({
      reminders: 1,
      completed: 1,
      restSeconds: 60
    });
    expect(stores.statsStore.getToday(nextDay)).toMatchObject({
      reminders: 0,
      completed: 0,
      restSeconds: 0
    });
  });

  it('persists a reset completion streak after a later snooze', () => {
    const stores = createControllerStores();
    stores.settings.activeThresholdMinutes = 1;
    stores.settings.minimumRestSeconds = 10;
    const controller = createController(stores);

    controller.refresh();
    const firstReminderAt = new Date(FAKE_WEEKDAY.getTime() + 61 * 1000);
    vi.setSystemTime(firstReminderAt);
    controller.refresh();
    controller.handleCountdownAction('start-rest');
    vi.setSystemTime(new Date(firstReminderAt.getTime() + 10 * 1000));
    controller.refresh();
    controller.completeRest();

    vi.setSystemTime(new Date(firstReminderAt.getTime() + 72 * 1000));
    controller.refresh();
    controller.handleCountdownAction('snooze');

    expect(controller.getSnapshot().currentCompletionStreak).toBe(0);
    expect(controller.getSnapshot().statsOverview.day.currentCompletionStreak).toBe(0);
  });
});

describe('snapshot runtime visibility', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('exposes overtime auto-end timing and missing-image fallback', () => {
    const overtime = new Date('2026-06-10T19:00:00');
    vi.setSystemTime(overtime);
    const stores = createControllerStores();
    const controller = createController(stores, {
      isImageFallbackActive: () => true
    });

    controller.refresh();

    expect(controller.getSnapshot()).toMatchObject({
      status: 'counting',
      isOvertime: true,
      overtimeAutoEndSeconds: stores.settings.overtimeAutoEndMinutes * 60,
      imageFallbackActive: true
    });
  });
});

describe('snooze and reminder strength flow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FAKE_WEEKDAY);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('gentle reminder strength snoozes instead of escalating on countdown timeout', () => {
    const stores = createControllerStores();
    stores.settings.reminderStrength = 'gentle';
    stores.settings.snoozeMinutes = 10;
    const controller = createController(stores);

    controller.testReminderFlow();
    controller.handleCountdownAction('timeout');

    const snapshot = controller.getSnapshot();
    expect(snapshot.status).toBe('snoozed');
    expect(snapshot.remainingSeconds).toBe(10 * 60);
    expect(snapshot.consecutiveSnoozes).toBe(0);
    expect(stores.statsStore.getToday().snoozed).toBe(0);
  });

  it('strong reminder strength opens fullscreen immediately', () => {
    const stores = createControllerStores();
    stores.settings.reminderStrength = 'strong';
    stores.settings.activeThresholdMinutes = 1;
    let openedFullscreen = 0;
    const controller = createController(stores, {
      openFullscreen: () => {
        openedFullscreen += 1;
      }
    });

    controller.refresh();
    vi.setSystemTime(new Date(FAKE_WEEKDAY.getTime() + 61 * 1000));
    controller.refresh();

    expect(controller.getSnapshot().status).toBe('fullscreen');
    expect(controller.getSnapshot().fullscreenRest?.phase).toBe('prompt');
    expect(openedFullscreen).toBe(1);
  });

  it('recovers when an active fullscreen rest window is closed externally', () => {
    const stores = createControllerStores();
    stores.settings.activeThresholdMinutes = 1;
    const controller = createController(stores);

    controller.refresh();
    vi.setSystemTime(new Date(FAKE_WEEKDAY.getTime() + 61 * 1000));
    controller.refresh();
    controller.handleCountdownAction('start-rest');
    controller.startRest();
    controller.handleReminderWindowClosed('fullscreen');

    expect(controller.getSnapshot().status).toBe('snoozed');
    expect(stores.statsStore.getToday()).toMatchObject({
      reminders: 1,
      interrupted: 1
    });
  });

  it('counts user snoozes and exposes consecutive snooze nudges', () => {
    const stores = createControllerStores();
    stores.settings.activeThresholdMinutes = 1;
    stores.settings.snoozeMinutes = 10;
    const controller = createController(stores);

    controller.refresh();
    vi.setSystemTime(new Date(FAKE_WEEKDAY.getTime() + 61 * 1000));
    controller.refresh();
    controller.handleCountdownAction('snooze');

    const snapshot = controller.getSnapshot();
    expect(snapshot.status).toBe('snoozed');
    expect(snapshot.consecutiveSnoozes).toBe(1);
    expect(stores.statsStore.getToday().snoozed).toBe(1);
  });
});

describe('workday start prompt choices', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FAKE_WEEKDAY);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('can postpone the workday prompt without muting the day', async () => {
    const stores = createControllerStores();
    stores.settings.workdayPromptSnoozeMinutes = 15;
    stores.daySessionStore.setDay(getDateKey(FAKE_WEEKDAY), createEmptyDaySession());
    let promptCalls = 0;
    const controller = createController(stores, {
      confirmWorkdayStart: async () => {
        promptCalls += 1;
        return 'later';
      }
    });

    controller.refresh();
    await Promise.resolve();
    await Promise.resolve();
    controller.refresh();
    expect(promptCalls).toBe(1);
    expect(controller.getSnapshot().status).toBe('awaiting-work-start');

    vi.setSystemTime(new Date(FAKE_WEEKDAY.getTime() + 15 * 60 * 1000 + 1000));
    controller.refresh();
    await Promise.resolve();
    await Promise.resolve();
    expect(promptCalls).toBe(2);
  });

  it('can mute today from the workday prompt', async () => {
    const stores = createControllerStores();
    stores.daySessionStore.setDay(getDateKey(FAKE_WEEKDAY), createEmptyDaySession());
    const controller = createController(stores, {
      confirmWorkdayStart: async () => 'mute-today'
    });

    controller.refresh();
    await Promise.resolve();
    await Promise.resolve();

    expect(controller.getSnapshot().status).toBe('muted-today');
    expect(stores.runtimeStateStore.get().mutedDateKey).toBe(getDateKey(FAKE_WEEKDAY));
  });

  it('ignores a workday start choice after the prompt expires', async () => {
    vi.setSystemTime(new Date('2026-06-10T17:59:00'));
    const stores = createControllerStores();
    stores.daySessionStore.setDay(getDateKey(new Date()), createEmptyDaySession());
    let resolveChoice: (choice: 'start') => void = () => undefined;
    const controller = createController(stores, {
      confirmWorkdayStart: () => new Promise((resolve) => {
        resolveChoice = resolve;
      })
    });

    controller.refresh();
    vi.setSystemTime(new Date('2026-06-10T18:01:00'));
    resolveChoice('start');
    await Promise.resolve();
    await Promise.resolve();

    expect(stores.daySessionStore.getToday().status).toBe('not-started');
    expect(controller.getSnapshot().status).toBe('outside-schedule');
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
      skipped: 1,
      snoozed: 0,
      interrupted: 0,
      restSeconds: 0,
      longestFocusSeconds: 0
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
      skipped: 4,
      snoozed: 0,
      interrupted: 0,
      restSeconds: 0,
      longestFocusSeconds: 0
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

describe('reminder clock seam', () => {
  it('drives scheduling and stat dates without changing the process clock', () => {
    const clock = new ManualReminderClock(FAKE_WEEKDAY);
    const stores = createControllerStores(clock.now);
    stores.settings.activeThresholdMinutes = 1;
    stores.settings.countdownSeconds = 5;
    const controller = createController(stores, {}, clock);

    controller.refresh();
    clock.advanceBy(61 * 1000);
    controller.refresh();

    expect(controller.getSnapshot().status).toBe('countdown');
    expect(stores.statsStore.getToday(clock.now()).reminders).toBe(1);

    clock.advanceBy(5 * 1000);
    expect(controller.getSnapshot().status).toBe('fullscreen');
  });
});

function createController(
  stores: ReturnType<typeof createControllerStores>,
  depsOverride: Partial<{
    confirmWorkdayStart: () => Promise<'start' | 'later' | 'mute-today'>;
    getIdleSeconds: () => number;
    showNotification: () => void;
    openCountdown: () => void;
    closeCountdown: () => void;
    openFullscreen: () => void;
    closeFullscreen: () => void;
    isImageFallbackActive: () => boolean;
    getFocusContext: () => { active: boolean; reason: 'fullscreen-app' | 'meeting-app' | null; appName: string | null };
  }> = {},
  clock?: ReminderClock
): ReminderController {
  return new ReminderController(
    stores.settingsStore,
    stores.statsStore,
    stores.daySessionStore,
    stores.runtimeStateStore,
    stores.poemStore,
    {
      getIdleSeconds: depsOverride.getIdleSeconds ?? (() => 0),
      showNotification: depsOverride.showNotification ?? (() => undefined),
      confirmWorkdayStart: depsOverride.confirmWorkdayStart ?? (async () => 'start'),
      openCountdown: depsOverride.openCountdown ?? (() => undefined),
      closeCountdown: depsOverride.closeCountdown ?? (() => undefined),
      openFullscreen: depsOverride.openFullscreen ?? (() => undefined),
      closeFullscreen: depsOverride.closeFullscreen ?? (() => undefined),
      isImageFallbackActive: depsOverride.isImageFallbackActive ?? (() => false),
      getFocusContext: depsOverride.getFocusContext
    },
    clock
  );
}

function createControllerStores(now: () => Date = () => new Date()) {
  const settings = createDefaultSettings();
  const stats: DailyStatsFile = {};
  let runtimeState: ReminderRuntimeState = createEmptyRuntimeState();
  let daySession: DaySession = {
    ...createEmptyDaySession(),
    status: 'working',
    startedAtIso: now().toISOString()
  };
  let poem = createFallbackDailyPoem(getDateKey(now()));
  const poemRefreshCalls: Array<{ force: boolean }> = [];

  return {
    settings,
    get runtimeState() {
      return runtimeState;
    },
    set runtimeState(next: ReminderRuntimeState) {
      runtimeState = next;
    },
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
      getToday: (date = now()): DailyStats => ({
        ...createEmptyDailyStats(),
        ...stats[getDateKey(date)]
      }),
      getOverview: (date = now()) => createStatsOverview(stats, date),
      getRecentDays: () => stats,
      setDay: (dateKey: string, next: DailyStats): DailyStats => {
        stats[dateKey] = next;
        return next;
      },
      incrementReminder: (date = now()): DailyStats => {
        const key = getDateKey(date);
        const current = {
          ...createEmptyDailyStats(),
          ...stats[key]
        };
        current.reminders += 1;
        stats[key] = current;
        return current;
      },
      recordOutcome: (outcome: 'completed' | 'skipped' | 'snoozed' | 'interrupted', date = now()): DailyStats => {
        const key = getDateKey(date);
        const current = {
          ...createEmptyDailyStats(),
          ...stats[key]
        };
        current[outcome] += 1;
        current.currentCompletionStreak = outcome === 'completed'
          ? current.currentCompletionStreak + 1
          : 0;
        stats[key] = current;
        return current;
      },
      addRestSeconds: (seconds: number, date = now()): DailyStats => {
        const key = getDateKey(date);
        const current = {
          ...createEmptyDailyStats(),
          ...stats[key]
        };
        current.restSeconds += Math.max(0, Math.floor(seconds));
        stats[key] = current;
        return current;
      },
      recordFocusSeconds: (seconds: number, date = now()): DailyStats => {
        const key = getDateKey(date);
        const current = {
          ...createEmptyDailyStats(),
          ...stats[key]
        };
        current.longestFocusSeconds = Math.max(current.longestFocusSeconds, Math.max(0, Math.floor(seconds)));
        stats[key] = current;
        return current;
      }
    },
    daySessionStore: {
      getToday: () => daySession,
      getRecentDays: () => ({
        [getDateKey(now())]: daySession
      }),
      setDay: (_dateKey: string, next: DaySession) => {
        daySession = next;
        return daySession;
      },
      start: () => {
        daySession = {
          ...daySession,
          status: 'working',
          startedAtIso: daySession.startedAtIso ?? now().toISOString(),
          endedAtIso: null
        };
        return daySession;
      },
      end: () => {
        daySession = {
          ...daySession,
          status: 'off-work',
          endedAtIso: now().toISOString()
        };
        return daySession;
      },
      markStartPrompted: () => {
        daySession = {
          ...daySession,
          startPromptedAtIso: now().toISOString()
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
      muteToday: (date = now()) => {
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
      },
      setSession: (patch: Partial<ReminderRuntimeState>) => {
        runtimeState = { ...runtimeState, ...patch };
        return runtimeState;
      }
    },
    poemStore: {
      getToday: (date = now()) => poem.dateKey === getDateKey(date) ? poem : createFallbackDailyPoem(getDateKey(date)),
      refreshToday: async (date = now(), options?: { force?: boolean }) => {
        poemRefreshCalls.push({ force: options?.force ?? false });
        poem = createFallbackDailyPoem(getDateKey(date));
        return poem;
      }
    }
  };
}

class ManualReminderClock implements ReminderClock {
  private currentMs: number;
  private nextTimerId = 1;
  private readonly timers = new Map<number, { callback: () => void; dueAtMs: number; intervalMs: number | null }>();

  constructor(date: Date) {
    this.currentMs = date.getTime();
  }

  readonly now = (): Date => new Date(this.currentMs);

  setTimeout = (callback: () => void, delayMs: number): ReminderTimerHandle => {
    return this.schedule(callback, delayMs, null);
  };

  clearTimeout = (handle: ReminderTimerHandle): void => {
    this.timers.delete(handle as number);
  };

  setInterval = (callback: () => void, intervalMs: number): ReminderTimerHandle => {
    return this.schedule(callback, intervalMs, intervalMs);
  };

  clearInterval = (handle: ReminderTimerHandle): void => {
    this.timers.delete(handle as number);
  };

  advanceBy(durationMs: number): void {
    const targetMs = this.currentMs + durationMs;
    let next = this.findNextTimer(targetMs);

    while (next) {
      const [id, timer] = next;
      this.currentMs = timer.dueAtMs;
      if (timer.intervalMs === null) {
        this.timers.delete(id);
      } else {
        timer.dueAtMs += timer.intervalMs;
      }
      timer.callback();
      next = this.findNextTimer(targetMs);
    }

    this.currentMs = targetMs;
  }

  private schedule(callback: () => void, delayMs: number, intervalMs: number | null): number {
    const id = this.nextTimerId;
    this.nextTimerId += 1;
    this.timers.set(id, {
      callback,
      dueAtMs: this.currentMs + Math.max(0, delayMs),
      intervalMs
    });
    return id;
  }

  private findNextTimer(targetMs: number): [number, { callback: () => void; dueAtMs: number; intervalMs: number | null }] | null {
    return [...this.timers.entries()]
      .filter(([, timer]) => timer.dueAtMs <= targetMs)
      .sort((left, right) => left[1].dueAtMs - right[1].dueAtMs || left[0] - right[0])[0] ?? null;
  }
}
