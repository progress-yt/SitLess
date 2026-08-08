import { describe, expect, it } from 'vitest';
import { createDefaultSettings } from './defaults';
import {
  applyEditableSettingsPatch,
  cloneSettings,
  getActiveRuntimeState,
  normalizeDaySessionFile,
  normalizeSettings,
  normalizeStatsFile
} from './persistence';

describe('settings persistence normalization', () => {
  it('migrates partial settings and rejects malformed values', () => {
    const defaults = createDefaultSettings();
    const settings = normalizeSettings({
      mode: 'unknown',
      workSchedule: {
        start: '9:05',
        lunch: {
          enabled: false,
          start: '25:00'
        }
      },
      minimumRestSeconds: 2,
      reminderStrength: 'loud',
      restPromptText: '  起身走一走  ',
      restStartButtonText: '   ',
      updatedAtIso: 'not-a-date'
    });

    expect(settings).toMatchObject({
      mode: 'active',
      minimumRestSeconds: 10,
      reminderStrength: 'standard',
      restPromptText: '起身走一走',
      restStartButtonText: defaults.restStartButtonText
    });
    expect(settings.workSchedule).toEqual({
      start: '09:05',
      end: defaults.workSchedule.end,
      lunch: {
        enabled: false,
        start: defaults.workSchedule.lunch.start,
        end: defaults.workSchedule.lunch.end
      }
    });
    expect(Number.isFinite(new Date(settings.updatedAtIso).getTime())).toBe(true);
  });

  it('returns a deep clone for editable settings drafts', () => {
    const settings = createDefaultSettings();
    const clone = cloneSettings(settings);

    clone.workSchedule.lunch.start = '11:30';
    clone.weeklySchedule.monday.start = '07:30';
    clone.scheduleOverrides.push({ dateKey: '2026-06-12', enabled: false, start: '09:00', end: '18:00', label: '调休' });
    expect(settings.workSchedule.lunch.start).not.toBe(clone.workSchedule.lunch.start);
    expect(settings.weeklySchedule.monday.start).not.toBe(clone.weeklySchedule.monday.start);
    expect(settings.scheduleOverrides).toHaveLength(0);
  });

  it('migrates a legacy shared schedule and normalizes date overrides', () => {
    const settings = normalizeSettings({
      workSchedule: { start: '08:30', end: '17:30' },
      scheduleOverrides: [
        { dateKey: '2026-06-13', enabled: true, start: '10:00', end: '16:00', label: ' 周末值班 ' },
        { dateKey: 'invalid', enabled: false, start: '09:00', end: '18:00' }
      ]
    });

    expect(settings.weeklySchedule.monday).toEqual({ enabled: true, start: '08:30', end: '17:30' });
    expect(settings.weeklySchedule.sunday.enabled).toBe(false);
    expect(settings.scheduleOverrides).toEqual([
      { dateKey: '2026-06-13', enabled: true, start: '10:00', end: '16:00', label: '周末值班' }
    ]);
  });

  it('keeps overtime auto-end independent and migrates its former field name', () => {
    expect(normalizeSettings({ idleResetMinutes: 12 }).overtimeAutoEndMinutes).toBe(60);
    expect(normalizeSettings({ autoEndIdleMinutes: 75 }).overtimeAutoEndMinutes).toBe(75);
  });

  it('applies editable patches without accepting protected image fields', () => {
    const current = {
      ...createDefaultSettings(),
      customReminderImagePath: 'C:\\managed\\reminder.png' as string | null,
      builtInReminderImageId: 'walk' as const,
      updatedAtIso: '2026-06-10T01:00:00.000Z'
    };

    const next = applyEditableSettingsPatch(current, {
      snoozeMinutes: 27,
      customReminderImagePath: 'C:\\Windows\\win.ini',
      builtInReminderImageId: 'photo-1',
      updatedAtIso: '1999-01-01T00:00:00.000Z'
    }, new Date('2026-06-10T02:00:00.000Z'));

    expect(next).toMatchObject({
      snoozeMinutes: 27,
      customReminderImagePath: 'C:\\managed\\reminder.png',
      builtInReminderImageId: 'walk',
      updatedAtIso: '2026-06-10T02:00:00.000Z'
    });
  });

  it('rejects cross-midnight work schedules that v1 cannot attribute safely', () => {
    const defaults = createDefaultSettings();
    const settings = normalizeSettings({
      workSchedule: {
        start: '22:00',
        end: '06:00'
      }
    });

    expect(settings.workSchedule.start).toBe(defaults.workSchedule.start);
    expect(settings.workSchedule.end).toBe(defaults.workSchedule.end);
  });

  it('keeps the current schedule when an editable patch would cross midnight', () => {
    const current = createDefaultSettings();
    current.workSchedule.start = '08:00';
    current.workSchedule.end = '17:00';

    const next = applyEditableSettingsPatch(current, {
      workSchedule: { start: '18:00' }
    });

    expect(next.workSchedule.start).toBe('08:00');
    expect(next.workSchedule.end).toBe('17:00');
  });

  it('rejects cross-midnight lunch breaks', () => {
    const defaults = createDefaultSettings();
    const loaded = normalizeSettings({
      workSchedule: {
        lunch: {
          start: '14:00',
          end: '13:00'
        }
      }
    });
    const patched = applyEditableSettingsPatch(defaults, {
      workSchedule: {
        lunch: {
          start: '14:00'
        }
      }
    });

    expect(loaded.workSchedule.lunch).toMatchObject({
      start: defaults.workSchedule.lunch.start,
      end: defaults.workSchedule.lunch.end
    });
    expect(patched.workSchedule.lunch).toEqual(defaults.workSchedule.lunch);
  });
});

describe('record persistence normalization', () => {
  it('migrates legacy stats and drops invalid date records', () => {
    const stats = normalizeStatsFile({
      '2026-06-10': {
        reminders: '3',
        completed: 2.9,
        skipped: -1
      },
      invalid: {
        reminders: 99
      }
    });

    expect(stats).toEqual({
      '2026-06-10': {
        reminders: 3,
        completed: 2,
        skipped: 0,
        snoozed: 0,
        interrupted: 0,
        restSeconds: 0,
        longestFocusSeconds: 0,
        currentCompletionStreak: 0
      }
    });
  });

  it('normalizes every day session before it enters an Electron store', () => {
    const sessions = normalizeDaySessionFile({
      '2026-06-10': {
        status: 'working',
        startedAtIso: '2026-06-10T09:00:00.000Z',
        endedAtIso: 'invalid',
        startPromptedAtIso: 42
      },
      '2026-02-30': {
        status: 'off-work'
      }
    });

    expect(sessions).toEqual({
      '2026-06-10': {
        status: 'working',
        startedAtIso: '2026-06-10T09:00:00.000Z',
        endedAtIso: null,
        startPromptedAtIso: null
      }
    });
  });
});

describe('runtime state normalization', () => {
  it('expires pause and mute state against the supplied clock date', () => {
    const active = getActiveRuntimeState({
      pauseUntilIso: '2026-06-10T09:59:00.000Z',
      mutedDateKey: '2026-06-09'
    }, new Date('2026-06-10T10:00:00.000Z'));

    expect(active).toEqual({
      pauseUntilIso: null,
      mutedDateKey: null,
      cycleStartedAtIso: null,
      snoozeUntilIso: null,
      reminderStartedAtIso: null,
      reminderPhase: 'running',
      consecutiveSnoozes: 0
    });
  });

  it('keeps recoverable reminder session fields', () => {
    const active = getActiveRuntimeState({
      pauseUntilIso: null,
      mutedDateKey: null,
      cycleStartedAtIso: '2026-06-10T09:30:00.000Z',
      snoozeUntilIso: '2026-06-10T10:15:00.000Z',
      reminderStartedAtIso: '2026-06-10T10:00:00.000Z',
      reminderPhase: 'snoozed',
      consecutiveSnoozes: 2
    }, new Date('2026-06-10T10:00:00.000Z'));

    expect(active).toMatchObject({ reminderPhase: 'snoozed', consecutiveSnoozes: 2 });
    expect(active.snoozeUntilIso).toBe('2026-06-10T10:15:00.000Z');
  });
});
