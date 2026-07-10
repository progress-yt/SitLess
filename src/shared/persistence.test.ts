import { describe, expect, it } from 'vitest';
import { createDefaultSettings } from './defaults';
import {
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
    expect(settings.workSchedule.lunch.start).not.toBe(clone.workSchedule.lunch.start);
  });

  it('keeps overtime auto-end independent and migrates its former field name', () => {
    expect(normalizeSettings({ idleResetMinutes: 12 }).overtimeAutoEndMinutes).toBe(60);
    expect(normalizeSettings({ autoEndIdleMinutes: 75 }).overtimeAutoEndMinutes).toBe(75);
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
      mutedDateKey: null
    });
  });
});
