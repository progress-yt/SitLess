import {
  createDefaultSettings,
  createEmptyDailyStats,
  createEmptyDaySession,
  createEmptyStatsOverview,
  createFallbackDailyPoem
} from '../shared/defaults';
import { getDateKey } from '../shared/schedule';
import type { AppSettings, AppSnapshot, CountdownAction, DailyDetailRecord, DailyPoem, DailyPoemRefreshResult, DailyRecordCorrection, DaySession, ImageSelectionResult } from '../shared/types';
import type { SitlessApi } from '../electron/preload';

const BROWSER_POEM_REFRESH_COOLDOWN_SECONDS = 60;

let browserSettings = createDefaultSettings();
let browserDaySession: DaySession = {
  ...createEmptyDaySession(),
  status: 'working',
  startedAtIso: new Date().toISOString(),
  endedAtIso: null,
  startPromptedAtIso: null
};
let browserDailyRecords: DailyDetailRecord[] = [];
let browserDailyPoem: DailyPoem | null = null;
let browserLastPoemRefreshAtMs: number | null = null;
let browserPoemRefreshInFlight = false;

function createBrowserSnapshot(): AppSnapshot {
  const now = new Date();
  const dateKey = getDateKey(now);
  browserDailyPoem = browserDailyPoem?.dateKey === dateKey ? browserDailyPoem : createFallbackDailyPoem(dateKey);
  return {
    nowIso: now.toISOString(),
    status: 'counting',
    settings: browserSettings,
    todayStats: createEmptyDailyStats(),
    statsOverview: createEmptyStatsOverview(dateKey),
    dailyRecords: getBrowserDailyRecords(dateKey),
    canRunReminders: browserDaySession.status === 'working',
    scheduleReason: 'weekday',
    remainingSeconds: browserSettings.activeThresholdMinutes * 60,
    nextReminderAtIso: new Date(Date.now() + browserSettings.activeThresholdMinutes * 60 * 1000).toISOString(),
    pauseUntilIso: null,
    mutedToday: false,
    daySession: browserDaySession,
    dailyPoem: browserDailyPoem,
    dailyPoemRefresh: getBrowserPoemRefreshState(now),
    idleSeconds: 0,
    imageRevision: 0
  };
}

const browserFallbackApi: SitlessApi = {
  getSnapshot: async () => createBrowserSnapshot(),
  updateSettings: async (settings: AppSettings) => {
    browserSettings = settings;
    return browserSettings;
  },
  selectReminderImage: async (): Promise<ImageSelectionResult> => ({
    cancelled: true,
    settings: browserSettings
  }),
  resetReminderImage: async () => {
    browserSettings = { ...browserSettings, customReminderImagePath: null };
    return browserSettings;
  },
  testReminderFlow: async () => createBrowserSnapshot(),
  pauseForHour: async () => ({ ...createBrowserSnapshot(), status: 'paused' }),
  resumeReminders: async () => createBrowserSnapshot(),
  muteToday: async () => ({ ...createBrowserSnapshot(), status: 'muted-today', mutedToday: true }),
  refreshDailyPoem: async (): Promise<DailyPoemRefreshResult> => {
    const now = new Date();
    if (browserPoemRefreshInFlight) {
      return {
        snapshot: createBrowserSnapshot(),
        status: 'busy',
        retryAfterSeconds: getBrowserPoemRefreshRetryAfterSeconds(now)
      };
    }

    const retryAfterSeconds = getBrowserPoemRefreshRetryAfterSeconds(now);
    if (retryAfterSeconds > 0) {
      return {
        snapshot: createBrowserSnapshot(),
        status: 'rate-limited',
        retryAfterSeconds
      };
    }

    browserPoemRefreshInFlight = true;
    browserLastPoemRefreshAtMs = now.getTime();
    browserDailyPoem = createFallbackDailyPoem(getDateKey(now));
    browserPoemRefreshInFlight = false;

    const snapshot = createBrowserSnapshot();
    return {
      snapshot,
      status: 'fallback',
      retryAfterSeconds: snapshot.dailyPoemRefresh.retryAfterSeconds
    };
  },
  updateDailyRecord: async (correction: DailyRecordCorrection) => {
    browserDailyRecords = upsertBrowserDailyRecord(browserDailyRecords, correction);
    return createBrowserSnapshot();
  },
  startWorkday: async () => {
    browserDaySession = {
      status: 'working',
      startedAtIso: browserDaySession.startedAtIso ?? new Date().toISOString(),
      endedAtIso: null,
      startPromptedAtIso: browserDaySession.startPromptedAtIso
    };
    return createBrowserSnapshot();
  },
  endWorkday: async () => {
    browserDaySession = {
      status: 'off-work',
      startedAtIso: browserDaySession.startedAtIso,
      endedAtIso: new Date().toISOString(),
      startPromptedAtIso: browserDaySession.startPromptedAtIso
    };
    return { ...createBrowserSnapshot(), status: 'off-work', daySession: browserDaySession };
  },
  countdownAction: (_action: CountdownAction) => undefined,
  completeRest: () => undefined,
  onSnapshot: () => () => undefined
};

export const sitlessApi: SitlessApi = window.sitless ?? browserFallbackApi;

function getBrowserDailyRecords(dateKey: string): DailyDetailRecord[] {
  if (browserDailyRecords.length > 0) {
    return browserDailyRecords;
  }

  return [
    {
      dateKey,
      workStatus: browserDaySession.status,
      workStartedAtIso: browserDaySession.startedAtIso,
      workEndedAtIso: browserDaySession.endedAtIso,
      reminders: 0,
      completed: 0,
      skipped: 0,
      completionRate: 0
    }
  ];
}

function upsertBrowserDailyRecord(records: DailyDetailRecord[], correction: DailyRecordCorrection): DailyDetailRecord[] {
  const next: DailyDetailRecord = {
    ...correction,
    completionRate: correction.reminders > 0 ? correction.completed / correction.reminders : 0
  };
  const rest = records.filter((record) => record.dateKey !== correction.dateKey);
  return [next, ...rest].sort((a, b) => b.dateKey.localeCompare(a.dateKey));
}

function getBrowserPoemRefreshState(now: Date) {
  const retryAfterSeconds = getBrowserPoemRefreshRetryAfterSeconds(now);
  return {
    canRefresh: !browserPoemRefreshInFlight && retryAfterSeconds === 0,
    isRefreshing: browserPoemRefreshInFlight,
    retryAfterSeconds
  };
}

function getBrowserPoemRefreshRetryAfterSeconds(now: Date): number {
  if (browserLastPoemRefreshAtMs === null) {
    return 0;
  }

  const elapsedMs = now.getTime() - browserLastPoemRefreshAtMs;
  const remainingMs = BROWSER_POEM_REFRESH_COOLDOWN_SECONDS * 1000 - elapsedMs;
  return Math.max(0, Math.ceil(remainingMs / 1000));
}
