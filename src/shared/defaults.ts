import type { AppSettings, DailyStats } from './types';

export const DEFAULT_SETTINGS: AppSettings = {
  mode: 'active',
  workSchedule: {
    start: '09:00',
    end: '18:00',
    lunch: {
      enabled: true,
      start: '12:00',
      end: '13:30'
    }
  },
  activeThresholdMinutes: 45,
  fixedIntervalMinutes: 45,
  idleResetMinutes: 5,
  snoozeMinutes: 10,
  countdownSeconds: 10,
  soundEnabled: true,
  launchAtStartup: false,
  hasSeenStartupPrompt: false,
  customReminderImagePath: null,
  updatedAtIso: new Date(0).toISOString()
};

export const EMPTY_DAILY_STATS: DailyStats = {
  reminders: 0,
  completed: 0,
  skipped: 0,
  workdayStatus: 'not-started'
};

export function createDefaultSettings(): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    workSchedule: {
      ...DEFAULT_SETTINGS.workSchedule,
      lunch: { ...DEFAULT_SETTINGS.workSchedule.lunch }
    },
    updatedAtIso: new Date().toISOString()
  };
}

export function createEmptyDailyStats(): DailyStats {
  return { ...EMPTY_DAILY_STATS };
}
