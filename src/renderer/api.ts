import { createDefaultSettings, createEmptyDailyStats } from '../shared/defaults';
import type { AppSettings, AppSnapshot, CountdownAction, ImageSelectionResult } from '../shared/types';
import type { SitlessApi } from '../electron/preload';

let browserSettings = createDefaultSettings();

function createBrowserSnapshot(): AppSnapshot {
  return {
    nowIso: new Date().toISOString(),
    status: 'counting',
    settings: browserSettings,
    todayStats: createEmptyDailyStats(),
    isWithinSchedule: true,
    scheduleReason: 'weekday',
    remainingSeconds: browserSettings.activeThresholdMinutes * 60,
    nextReminderAtIso: new Date(Date.now() + browserSettings.activeThresholdMinutes * 60 * 1000).toISOString(),
    pauseUntilIso: null,
    mutedToday: false,
    workdayStatus: 'working',
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
  muteToday: async () => ({ ...createBrowserSnapshot(), status: 'muted-today', mutedToday: true }),
  startWorkday: async () => ({ ...createBrowserSnapshot(), status: 'counting', workdayStatus: 'working' }),
  endWorkday: async () => ({ ...createBrowserSnapshot(), status: 'off-work', workdayStatus: 'off-work' }),
  countdownAction: (_action: CountdownAction) => undefined,
  completeRest: () => undefined,
  onSnapshot: () => () => undefined
};

export const sitlessApi: SitlessApi = window.sitless ?? browserFallbackApi;
