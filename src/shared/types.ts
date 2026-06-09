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
  restPromptText: string;
  updatedAtIso: string;
}

export interface DailyStats {
  reminders: number;
  completed: number;
  skipped: number;
}

export type StatsPeriod = 'day' | 'week' | 'month';

export interface StatsSummary extends DailyStats {
  period: StatsPeriod;
  startDateKey: string;
  endDateKey: string;
  activeDays: number;
  completionRate: number;
}

export interface StatsOverview {
  day: StatsSummary;
  week: StatsSummary;
  month: StatsSummary;
}

export interface DailyDetailRecord extends DailyStats {
  dateKey: string;
  workStatus: WorkdayStatus;
  workStartedAtIso: string | null;
  workEndedAtIso: string | null;
  completionRate: number;
}

export interface DailyRecordCorrection extends DailyStats {
  dateKey: string;
  workStatus: WorkdayStatus;
  workStartedAtIso: string | null;
  workEndedAtIso: string | null;
}

export interface DaySession {
  status: WorkdayStatus;
  startedAtIso: string | null;
  endedAtIso: string | null;
  startPromptedAtIso: string | null;
}

export interface ReminderRuntimeState {
  pauseUntilIso: string | null;
  mutedDateKey: string | null;
}

export interface DailyPoem {
  dateKey: string;
  content: string;
  author: string | null;
  title: string | null;
  source: 'jinrishici' | 'fallback' | 'cache';
}

export interface AppSnapshot {
  nowIso: string;
  status: AppStatus;
  settings: AppSettings;
  todayStats: DailyStats;
  statsOverview: StatsOverview;
  dailyRecords: DailyDetailRecord[];
  canRunReminders: boolean;
  scheduleReason: 'weekday' | 'weekend' | 'before-work' | 'after-work' | 'lunch';
  remainingSeconds: number | null;
  nextReminderAtIso: string | null;
  pauseUntilIso: string | null;
  mutedToday: boolean;
  daySession: DaySession;
  dailyPoem: DailyPoem | null;
  idleSeconds: number;
  imageRevision: number;
}

export type CountdownAction = 'start-rest' | 'snooze' | 'skip' | 'timeout';

export interface ImageSelectionResult {
  cancelled: boolean;
  settings: AppSettings;
}
