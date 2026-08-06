import {
  BUILT_IN_REMINDER_IMAGES,
  DEFAULT_BUILT_IN_REMINDER_IMAGE_ID,
  DEFAULT_REST_PROMPT_OPTIONS,
  createDefaultSettings,
  createEmptyDailyStats,
  createEmptyDaySession,
  createEmptyRuntimeState
} from './defaults';
import { clampNumber, getDateKey, parseTimeToMinutes } from './schedule';
import type {
  AppSettings,
  AppSettingsPatch,
  BuiltInReminderImageId,
  DailyStats,
  DailyStatsFile,
  DaySession,
  DaySessionFile,
  ReminderRuntimeState
} from './types';

const REST_PROMPT_MAX_LENGTH = 50;
const REST_BUTTON_MAX_LENGTH = 16;

export function normalizeSettings(value: unknown): AppSettings {
  const defaults = createDefaultSettings();
  const object = isRecord(value) ? value : {};
  const workSchedule = isRecord(object.workSchedule) ? object.workSchedule : {};
  const lunch = isRecord(workSchedule.lunch) ? workSchedule.lunch : {};
  const normalizedWorkStart = normalizeTimeString(workSchedule.start, defaults.workSchedule.start);
  const normalizedWorkEnd = normalizeTimeString(workSchedule.end, defaults.workSchedule.end);
  const hasSameDayWorkSchedule = parseTimeToMinutes(normalizedWorkStart) < parseTimeToMinutes(normalizedWorkEnd);

  return {
    mode: object.mode === 'fixed' ? 'fixed' : 'active',
    workSchedule: {
      start: hasSameDayWorkSchedule ? normalizedWorkStart : defaults.workSchedule.start,
      end: hasSameDayWorkSchedule ? normalizedWorkEnd : defaults.workSchedule.end,
      lunch: {
        enabled: typeof lunch.enabled === 'boolean' ? lunch.enabled : defaults.workSchedule.lunch.enabled,
        start: normalizeTimeString(lunch.start, defaults.workSchedule.lunch.start),
        end: normalizeTimeString(lunch.end, defaults.workSchedule.lunch.end)
      }
    },
    activeThresholdMinutes: clampNumber(Number(object.activeThresholdMinutes ?? defaults.activeThresholdMinutes), 1, 240),
    fixedIntervalMinutes: clampNumber(Number(object.fixedIntervalMinutes ?? defaults.fixedIntervalMinutes), 1, 240),
    idleResetMinutes: clampNumber(Number(object.idleResetMinutes ?? defaults.idleResetMinutes), 1, 60),
    overtimeAutoEndMinutes: clampNumber(
      Number(object.overtimeAutoEndMinutes ?? object.autoEndIdleMinutes ?? defaults.overtimeAutoEndMinutes),
      15,
      240
    ),
    snoozeMinutes: clampNumber(Number(object.snoozeMinutes ?? defaults.snoozeMinutes), 1, 240),
    countdownSeconds: clampNumber(Number(object.countdownSeconds ?? defaults.countdownSeconds), 3, 120),
    minimumRestSeconds: clampNumber(Number(object.minimumRestSeconds ?? defaults.minimumRestSeconds), 10, 1800),
    reminderStrength: normalizeReminderStrength(object.reminderStrength),
    workdayPromptSnoozeMinutes: clampNumber(Number(object.workdayPromptSnoozeMinutes ?? defaults.workdayPromptSnoozeMinutes), 1, 240),
    soundEnabled: typeof object.soundEnabled === 'boolean' ? object.soundEnabled : defaults.soundEnabled,
    launchAtStartup: typeof object.launchAtStartup === 'boolean' ? object.launchAtStartup : defaults.launchAtStartup,
    hasSeenStartupPrompt: typeof object.hasSeenStartupPrompt === 'boolean' ? object.hasSeenStartupPrompt : defaults.hasSeenStartupPrompt,
    customReminderImagePath: typeof object.customReminderImagePath === 'string' && object.customReminderImagePath
      ? object.customReminderImagePath
      : null,
    builtInReminderImageId: normalizeBuiltInReminderImageId(object.builtInReminderImageId),
    restPromptText: normalizeRestPromptText(object.restPromptText),
    restStartButtonText: normalizeButtonText(object.restStartButtonText, defaults.restStartButtonText),
    restCompleteButtonText: normalizeButtonText(object.restCompleteButtonText, defaults.restCompleteButtonText),
    restInterruptButtonText: normalizeButtonText(object.restInterruptButtonText, defaults.restInterruptButtonText),
    updatedAtIso: normalizeIsoString(object.updatedAtIso, defaults.updatedAtIso) ?? defaults.updatedAtIso
  };
}

export function cloneSettings(settings: AppSettings): AppSettings {
  return {
    ...settings,
    workSchedule: {
      ...settings.workSchedule,
      lunch: { ...settings.workSchedule.lunch }
    }
  };
}

export function applyEditableSettingsPatch(
  current: AppSettings,
  value: unknown,
  updatedAt = new Date()
): AppSettings {
  const patch = isRecord(value) ? value : {};
  const workSchedulePatch = isRecord(patch.workSchedule) ? patch.workSchedule : {};
  const lunchPatch = isRecord(workSchedulePatch.lunch) ? workSchedulePatch.lunch : {};
  const editablePatch = patch as AppSettingsPatch;
  const candidateWorkStart = normalizeTimeString(workSchedulePatch.start, current.workSchedule.start);
  const candidateWorkEnd = normalizeTimeString(workSchedulePatch.end, current.workSchedule.end);
  const hasSameDayWorkSchedule = parseTimeToMinutes(candidateWorkStart) < parseTimeToMinutes(candidateWorkEnd);

  return normalizeSettings({
    ...current,
    ...editablePatch,
    workSchedule: {
      ...current.workSchedule,
      ...workSchedulePatch,
      start: hasSameDayWorkSchedule ? candidateWorkStart : current.workSchedule.start,
      end: hasSameDayWorkSchedule ? candidateWorkEnd : current.workSchedule.end,
      lunch: {
        ...current.workSchedule.lunch,
        ...lunchPatch
      }
    },
    customReminderImagePath: current.customReminderImagePath,
    builtInReminderImageId: current.builtInReminderImageId,
    updatedAtIso: updatedAt.toISOString()
  });
}

export function normalizeDailyStats(value: unknown): DailyStats {
  const object = isRecord(value) ? value : {};
  return {
    ...createEmptyDailyStats(),
    reminders: normalizeCount(object.reminders),
    completed: normalizeCount(object.completed),
    skipped: normalizeCount(object.skipped),
    snoozed: normalizeCount(object.snoozed),
    interrupted: normalizeCount(object.interrupted),
    restSeconds: normalizeCount(object.restSeconds),
    longestFocusSeconds: normalizeCount(object.longestFocusSeconds),
    currentCompletionStreak: normalizeCount(object.currentCompletionStreak)
  };
}

export function normalizeStatsFile(value: unknown): DailyStatsFile {
  if (!isRecord(value)) {
    return {};
  }

  return Object.entries(value).reduce<DailyStatsFile>((records, [dateKey, stats]) => {
    if (isDateKey(dateKey) && isRecord(stats)) {
      records[dateKey] = normalizeDailyStats(stats);
    }
    return records;
  }, {});
}

export function normalizeDaySession(value: unknown): DaySession {
  const empty = createEmptyDaySession();
  const object = isRecord(value) ? value : {};
  return {
    status: object.status === 'working' || object.status === 'off-work' ? object.status : empty.status,
    startedAtIso: normalizeIsoString(object.startedAtIso),
    endedAtIso: normalizeIsoString(object.endedAtIso),
    startPromptedAtIso: normalizeIsoString(object.startPromptedAtIso)
  };
}

export function normalizeDaySessionFile(value: unknown): DaySessionFile {
  if (!isRecord(value)) {
    return {};
  }

  return Object.entries(value).reduce<DaySessionFile>((records, [dateKey, session]) => {
    if (isDateKey(dateKey) && isRecord(session)) {
      records[dateKey] = normalizeDaySession(session);
    }
    return records;
  }, {});
}

export function normalizeRuntimeState(value: unknown): ReminderRuntimeState {
  const empty = createEmptyRuntimeState();
  const object = isRecord(value) ? value : {};
  return {
    pauseUntilIso: normalizeIsoString(object.pauseUntilIso),
    mutedDateKey: typeof object.mutedDateKey === 'string' && isDateKey(object.mutedDateKey)
      ? object.mutedDateKey
      : empty.mutedDateKey
  };
}

export function getActiveRuntimeState(value: unknown, date: Date): ReminderRuntimeState {
  const state = normalizeRuntimeState(value);
  const pauseUntilMs = state.pauseUntilIso ? new Date(state.pauseUntilIso).getTime() : Number.NaN;
  return {
    pauseUntilIso: Number.isFinite(pauseUntilMs) && pauseUntilMs > date.getTime() ? state.pauseUntilIso : null,
    mutedDateKey: state.mutedDateKey === getDateKey(date) ? state.mutedDateKey : null
  };
}

export function normalizeCount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

function normalizeRestPromptText(value: unknown): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return (normalized || DEFAULT_REST_PROMPT_OPTIONS[0]).slice(0, REST_PROMPT_MAX_LENGTH);
}

function normalizeButtonText(value: unknown, fallback: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return (normalized || fallback).slice(0, REST_BUTTON_MAX_LENGTH);
}

function normalizeBuiltInReminderImageId(value: unknown): BuiltInReminderImageId {
  return BUILT_IN_REMINDER_IMAGES.some((image) => image.id === value)
    ? value as BuiltInReminderImageId
    : DEFAULT_BUILT_IN_REMINDER_IMAGE_ID;
}

function normalizeReminderStrength(value: unknown): AppSettings['reminderStrength'] {
  return value === 'gentle' || value === 'strong' ? value : 'standard';
}

function normalizeTimeString(value: unknown, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback;
  }

  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) {
    return fallback;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return fallback;
  }

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function normalizeIsoString(value: unknown, fallback: string | null = null): string | null {
  if (typeof value !== 'string' || !Number.isFinite(new Date(value).getTime())) {
    return fallback;
  }
  return value;
}

function isDateKey(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return false;
  }

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return getDateKey(date) === value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
