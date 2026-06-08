export type ReminderMode = 'active' | 'fixed';

export type AppStatus =
  | 'outside-schedule'
  | 'lunch-break'
  | 'awaiting-work-start'
  | 'counting'
  | 'idle-reset'
  | 'snoozed'
  | 'paused'
  | 'muted-today'
  | 'off-work'
  | 'countdown'
  | 'fullscreen';

export type WorkdayStatus = 'not-started' | 'working' | 'off-work';

export interface LunchBreakSettings {
  enabled: boolean;
  start: string;
  end: string;
}

export interface WorkScheduleSettings {
  start: string;
  end: string;
  lunch: LunchBreakSettings;
}

export interface AppSettings {
  mode: ReminderMode;
  workSchedule: WorkScheduleSettings;
  activeThresholdMinutes: number;
  fixedIntervalMinutes: number;
  idleResetMinutes: number;
  snoozeMinutes: number;
  countdownSeconds: number;
  soundEnabled: boolean;
  launchAtStartup: boolean;
  hasSeenStartupPrompt: boolean;
  customReminderImagePath: string | null;
  updatedAtIso: string;
}

export interface DailyStats {
  reminders: number;
  completed: number;
  skipped: number;
  workdayStatus: WorkdayStatus;
}

export interface AppSnapshot {
  nowIso: string;
  status: AppStatus;
  settings: AppSettings;
  todayStats: DailyStats;
  isWithinSchedule: boolean;
  scheduleReason: 'weekday' | 'weekend' | 'before-work' | 'after-work' | 'lunch';
  remainingSeconds: number | null;
  nextReminderAtIso: string | null;
  pauseUntilIso: string | null;
  mutedToday: boolean;
  workdayStatus: WorkdayStatus;
  idleSeconds: number;
  imageRevision: number;
}

export type CountdownAction = 'start-rest' | 'snooze' | 'skip' | 'timeout';

export interface ImageSelectionResult {
  cancelled: boolean;
  settings: AppSettings;
}
