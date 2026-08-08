import {
  DEFAULT_BUILT_IN_REMINDER_IMAGE_ID,
  REST_EXERCISES,
  createDefaultSettings,
  createEmptyDailyStats,
  createEmptyDaySession,
  createEmptyStatsOverview,
  createFallbackDailyPoem
} from '../shared/defaults';
import { clampNumber, getDateKey } from '../shared/schedule';
import { applyEditableSettingsPatch } from '../shared/persistence';
import { createTrendPoints } from '../shared/stats';
import type { SitlessApi } from '../shared/ipc';
import type {
  AppSettings,
  AppSnapshot,
  AppStatus,
  DailyDetailRecord,
  DailyPoem,
  DailyPoemRefreshResult,
  DailyRecordCorrection,
  DaySession,
  FullscreenRestState,
  ImageSelectionResult
} from '../shared/types';

const BROWSER_POEM_REFRESH_COOLDOWN_SECONDS = 60;

export function createBrowserFallbackApi(): SitlessApi {
  let settings = createDefaultSettings();
  let daySession: DaySession = {
    ...createEmptyDaySession(),
    status: 'working',
    startedAtIso: new Date().toISOString()
  };
  let dailyRecords: DailyDetailRecord[] = [];
  let dailyPoem: DailyPoem | null = null;
  let lastPoemRefreshAtMs: number | null = null;
  let poemRefreshInFlight = false;
  let pauseUntilIso: string | null = null;
  let mutedToday = false;
  let status: AppStatus = 'counting';
  let snoozeUntilIso: string | null = null;
  let fullscreenRest: FullscreenRestState | null = null;
  const listeners = new Set<Parameters<SitlessApi['onSnapshot']>[0]>();

  const getPoemRefreshRetryAfterSeconds = (now: Date): number => {
    if (lastPoemRefreshAtMs === null) {
      return 0;
    }

    const elapsedMs = now.getTime() - lastPoemRefreshAtMs;
    const remainingMs = BROWSER_POEM_REFRESH_COOLDOWN_SECONDS * 1000 - elapsedMs;
    return Math.max(0, Math.ceil(remainingMs / 1000));
  };

  const createSnapshot = (): AppSnapshot => {
    const now = new Date();
    const dateKey = getDateKey(now);
    const thresholdMinutes = settings.mode === 'active'
      ? settings.activeThresholdMinutes
      : settings.fixedIntervalMinutes;
    const retryAfterSeconds = getPoemRefreshRetryAfterSeconds(now);
    dailyPoem = dailyPoem?.dateKey === dateKey ? dailyPoem : createFallbackDailyPoem(dateKey);

    return {
      nowIso: now.toISOString(),
      status,
      settings,
      todayStats: createEmptyDailyStats(),
      statsOverview: createEmptyStatsOverview(dateKey),
      dailyRecords: getDailyRecords(dateKey, daySession, dailyRecords),
      trend: createTrendPoints({}, now, 14),
      canRunReminders: daySession.status === 'working' && !mutedToday,
      scheduleReason: 'weekday',
      remainingSeconds: getRemainingSeconds(status, now, pauseUntilIso, snoozeUntilIso, thresholdMinutes),
      countdownDurationSeconds: status === 'countdown' ? settings.countdownSeconds : null,
      nextReminderAtIso: status === 'counting'
        ? new Date(now.getTime() + thresholdMinutes * 60 * 1000).toISOString()
        : null,
      pauseUntilIso,
      mutedToday,
      isOvertime: false,
      overtimeAutoEndSeconds: null,
      consecutiveSnoozes: 0,
      currentCompletionStreak: 0,
      imageFallbackActive: false,
      daySession,
      dailyPoem,
      dailyPoemRefresh: {
        canRefresh: !poemRefreshInFlight && retryAfterSeconds === 0,
        isRefreshing: poemRefreshInFlight,
        retryAfterSeconds
      },
      fullscreenRest,
      restExercise: status === 'fullscreen' && settings.guidedRestEnabled ? REST_EXERCISES[0] : null,
      focusContext: { active: false, reason: null, appName: null },
      idleSeconds: 0,
      imageRevision: 0
    };
  };

  const emitSnapshot = (): AppSnapshot => {
    const snapshot = createSnapshot();
    listeners.forEach((listener) => listener(snapshot));
    return snapshot;
  };

  return {
    getSnapshot: async () => createSnapshot(),
    updateSettings: async (patch) => {
      settings = applyEditableSettingsPatch(settings, patch);
      emitSnapshot();
      return settings;
    },
    selectReminderImage: async (): Promise<ImageSelectionResult> => ({
      cancelled: true,
      settings
    }),
    resetReminderImage: async () => {
      settings = {
        ...settings,
        customReminderImagePath: null,
        builtInReminderImageId: DEFAULT_BUILT_IN_REMINDER_IMAGE_ID
      };
      emitSnapshot();
      return settings;
    },
    setBuiltInReminderImage: async (imageId) => {
      settings = {
        ...settings,
        customReminderImagePath: null,
        builtInReminderImageId: imageId
      };
      emitSnapshot();
      return settings;
    },
    testReminderFlow: async () => {
      status = 'countdown';
      return emitSnapshot();
    },
    pauseForHour: async () => {
      pauseUntilIso = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      status = 'paused';
      return emitSnapshot();
    },
    focusForMinutes: async (minutes: number) => {
      const durationMinutes = clampNumber(Math.floor(Number(minutes)), 1, 240);
      pauseUntilIso = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();
      status = 'paused';
      return emitSnapshot();
    },
    resumeReminders: async () => {
      pauseUntilIso = null;
      status = 'counting';
      return emitSnapshot();
    },
    muteToday: async () => {
      mutedToday = true;
      status = 'muted-today';
      return emitSnapshot();
    },
    refreshDailyPoem: async (): Promise<DailyPoemRefreshResult> => {
      const now = new Date();
      if (poemRefreshInFlight) {
        return {
          snapshot: createSnapshot(),
          status: 'busy',
          retryAfterSeconds: getPoemRefreshRetryAfterSeconds(now)
        };
      }

      const retryAfterSeconds = getPoemRefreshRetryAfterSeconds(now);
      if (retryAfterSeconds > 0) {
        return {
          snapshot: createSnapshot(),
          status: 'rate-limited',
          retryAfterSeconds
        };
      }

      poemRefreshInFlight = true;
      lastPoemRefreshAtMs = now.getTime();
      emitSnapshot();
      dailyPoem = createFallbackDailyPoem(getDateKey(now));
      poemRefreshInFlight = false;

      const snapshot = emitSnapshot();
      return {
        snapshot,
        status: 'fallback',
        retryAfterSeconds: snapshot.dailyPoemRefresh.retryAfterSeconds
      };
    },
    updateDailyRecord: async (correction: DailyRecordCorrection) => {
      dailyRecords = upsertDailyRecord(dailyRecords, correction);
      return emitSnapshot();
    },
    exportDataJson: async () => ({ cancelled: true, path: null }),
    importDataJson: async () => ({ cancelled: true, path: null }),
    exportStatsCsv: async () => ({ cancelled: true, path: null }),
    exportDiagnostics: async () => ({ cancelled: true, path: null }),
    getUpdateState: async () => ({
      status: 'unavailable',
      currentVersion: 'browser-preview',
      availableVersion: null,
      message: '浏览器预览不支持自动更新'
    }),
    checkForUpdates: async () => ({
      status: 'unavailable',
      currentVersion: 'browser-preview',
      availableVersion: null,
      message: '浏览器预览不支持自动更新'
    }),
    installUpdate: async () => ({
      status: 'unavailable',
      currentVersion: 'browser-preview',
      availableVersion: null,
      message: '浏览器预览不支持自动更新'
    }),
    startWorkday: async () => {
      daySession = {
        status: 'working',
        startedAtIso: daySession.startedAtIso ?? new Date().toISOString(),
        endedAtIso: null,
        startPromptedAtIso: daySession.startPromptedAtIso
      };
      mutedToday = false;
      status = 'counting';
      return emitSnapshot();
    },
    endWorkday: async () => {
      daySession = {
        status: 'off-work',
        startedAtIso: daySession.startedAtIso,
        endedAtIso: new Date().toISOString(),
        startPromptedAtIso: daySession.startPromptedAtIso
      };
      status = 'off-work';
      return emitSnapshot();
    },
    countdownAction: (action) => {
      if (action === 'start-rest' || action === 'timeout') {
        status = 'fullscreen';
        fullscreenRest = createRestPrompt(settings.minimumRestSeconds);
      } else if (action === 'snooze') {
        status = 'snoozed';
        snoozeUntilIso = new Date(Date.now() + settings.snoozeMinutes * 60 * 1000).toISOString();
      } else {
        status = 'counting';
      }
      emitSnapshot();
    },
    startRest: () => {
      const startedAt = new Date();
      status = 'fullscreen';
      fullscreenRest = {
        phase: 'resting',
        startedAtIso: startedAt.toISOString(),
        remainingSeconds: settings.minimumRestSeconds,
        minimumRestSeconds: settings.minimumRestSeconds,
        canComplete: false
      };
      emitSnapshot();
    },
    completeRest: () => {
      status = 'counting';
      fullscreenRest = null;
      emitSnapshot();
    },
    interruptRest: () => {
      status = 'snoozed';
      fullscreenRest = null;
      snoozeUntilIso = new Date(Date.now() + settings.snoozeMinutes * 60 * 1000).toISOString();
      emitSnapshot();
    },
    onSnapshot: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}

function getDailyRecords(
  dateKey: string,
  daySession: DaySession,
  dailyRecords: DailyDetailRecord[]
): DailyDetailRecord[] {
  if (dailyRecords.length > 0) {
    return dailyRecords;
  }

  return [{
    dateKey,
    workStatus: daySession.status,
    workStartedAtIso: daySession.startedAtIso,
    workEndedAtIso: daySession.endedAtIso,
    reminders: 0,
    completed: 0,
    skipped: 0,
    snoozed: 0,
    interrupted: 0,
    restSeconds: 0,
    longestFocusSeconds: 0,
    currentCompletionStreak: 0,
    completionRate: 0
  }];
}

function upsertDailyRecord(
  records: DailyDetailRecord[],
  correction: DailyRecordCorrection
): DailyDetailRecord[] {
  const next: DailyDetailRecord = {
    ...correction,
    currentCompletionStreak: 0,
    completionRate: correction.reminders > 0 ? correction.completed / correction.reminders : 0
  };
  const rest = records.filter((record) => record.dateKey !== correction.dateKey);
  return [next, ...rest].sort((a, b) => b.dateKey.localeCompare(a.dateKey));
}

function createRestPrompt(minimumRestSeconds: number): FullscreenRestState {
  return {
    phase: 'prompt',
    startedAtIso: null,
    remainingSeconds: minimumRestSeconds,
    minimumRestSeconds,
    canComplete: false
  };
}

function getRemainingSeconds(
  status: AppStatus,
  now: Date,
  pauseUntilIso: string | null,
  snoozeUntilIso: string | null,
  thresholdMinutes: number
): number | null {
  const targetIso = status === 'paused' ? pauseUntilIso : status === 'snoozed' ? snoozeUntilIso : null;
  if (targetIso) {
    return Math.max(0, Math.ceil((new Date(targetIso).getTime() - now.getTime()) / 1000));
  }
  return status === 'counting' ? thresholdMinutes * 60 : null;
}
