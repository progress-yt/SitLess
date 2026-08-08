export type ReminderMode = 'active' | 'fixed';
export type ReminderStrength = 'gentle' | 'standard' | 'strong';
export type WeekdayKey = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export type AppStatus =
  | 'outside-schedule'
  | 'lunch-break'
  | 'awaiting-work-start'
  | 'counting'
  | 'idle-reset'
  | 'snoozed'
  | 'paused'
  | 'context-paused'
  | 'muted-today'
  | 'off-work'
  | 'countdown'
  | 'fullscreen';

export type WorkdayStatus = 'not-started' | 'working' | 'off-work';

export type BuiltInReminderImageId = 'desk' | 'walk' | 'photo-1' | 'photo-2';

export interface BuiltInReminderImage {
  id: BuiltInReminderImageId;
  label: string;
  description: string;
  assetFilename: string;
}

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

export interface DailyScheduleSettings {
  enabled: boolean;
  start: string;
  end: string;
}

export type WeeklyScheduleSettings = Record<WeekdayKey, DailyScheduleSettings>;

export interface ScheduleOverride {
  dateKey: string;
  enabled: boolean;
  start: string;
  end: string;
  label: string;
}

export interface AppSettings {
  mode: ReminderMode;
  workSchedule: WorkScheduleSettings;
  weeklySchedule: WeeklyScheduleSettings;
  scheduleOverrides: ScheduleOverride[];
  activeThresholdMinutes: number;
  fixedIntervalMinutes: number;
  idleResetMinutes: number;
  overtimeAutoEndMinutes: number;
  snoozeMinutes: number;
  countdownSeconds: number;
  minimumRestSeconds: number;
  reminderStrength: ReminderStrength;
  workdayPromptSnoozeMinutes: number;
  soundEnabled: boolean;
  respectFocusContext: boolean;
  guidedRestEnabled: boolean;
  automaticUpdatesEnabled: boolean;
  launchAtStartup: boolean;
  hasSeenStartupPrompt: boolean;
  customReminderImagePath: string | null;
  builtInReminderImageId: BuiltInReminderImageId;
  restPromptText: string;
  restStartButtonText: string;
  restCompleteButtonText: string;
  restInterruptButtonText: string;
  updatedAtIso: string;
}

type EditableAppSettings = Omit<
  AppSettings,
  'workSchedule' | 'weeklySchedule' | 'scheduleOverrides' | 'customReminderImagePath' | 'builtInReminderImageId' | 'updatedAtIso'
>;

export type AppSettingsPatch = Partial<EditableAppSettings> & {
  workSchedule?: Partial<Omit<WorkScheduleSettings, 'lunch'>> & {
    lunch?: Partial<LunchBreakSettings>;
  };
  weeklySchedule?: Partial<Record<WeekdayKey, Partial<DailyScheduleSettings>>>;
  scheduleOverrides?: ScheduleOverride[];
};

export interface DailyStats {
  reminders: number;
  completed: number;
  skipped: number;
  snoozed: number;
  interrupted: number;
  restSeconds: number;
  longestFocusSeconds: number;
  currentCompletionStreak: number;
}

export type DailyStatsFile = Record<string, DailyStats>;

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

export type DailyRecordCorrection = Omit<DailyStats, 'currentCompletionStreak'> & {
  dateKey: string;
  workStatus: WorkdayStatus;
  workStartedAtIso: string | null;
  workEndedAtIso: string | null;
};

export interface DaySession {
  status: WorkdayStatus;
  startedAtIso: string | null;
  endedAtIso: string | null;
  startPromptedAtIso: string | null;
}

export interface ReminderRuntimeState {
  pauseUntilIso: string | null;
  mutedDateKey: string | null;
  cycleStartedAtIso: string | null;
  snoozeUntilIso: string | null;
  reminderStartedAtIso: string | null;
  reminderPhase: 'running' | 'snoozed' | 'pending';
  consecutiveSnoozes: number;
}

export interface RestExercise {
  id: string;
  title: string;
  instruction: string;
  target: 'eyes' | 'neck' | 'back' | 'legs' | 'breathing';
}

export interface TrendPoint {
  dateKey: string;
  completionRate: number;
  restSeconds: number;
  longestFocusSeconds: number;
}

export interface FocusContextState {
  active: boolean;
  reason: 'fullscreen-app' | 'meeting-app' | null;
  appName: string | null;
}

export type UpdateStatus = 'disabled' | 'unavailable' | 'idle' | 'checking' | 'available' | 'downloaded' | 'up-to-date' | 'error';

export interface UpdateState {
  status: UpdateStatus;
  currentVersion: string;
  availableVersion: string | null;
  message: string | null;
}

export interface DataOperationResult {
  cancelled: boolean;
  path: string | null;
  restartRequired?: boolean;
}

export interface DailyPoem {
  dateKey: string;
  content: string;
  author: string | null;
  title: string | null;
  source: 'jinrishici' | 'fallback' | 'cache';
}

export type DaySessionFile = Record<string, DaySession>;

export interface DailyPoemRefreshState {
  canRefresh: boolean;
  isRefreshing: boolean;
  retryAfterSeconds: number;
}

export type DailyPoemRefreshStatus = 'refreshed' | 'fallback' | 'rate-limited' | 'busy';

export interface DailyPoemRefreshResult {
  snapshot: AppSnapshot;
  status: DailyPoemRefreshStatus;
  retryAfterSeconds: number;
}

export interface FullscreenRestState {
  phase: 'prompt' | 'resting' | 'ready';
  startedAtIso: string | null;
  remainingSeconds: number;
  minimumRestSeconds: number;
  canComplete: boolean;
}

export interface AppSnapshot {
  nowIso: string;
  status: AppStatus;
  settings: AppSettings;
  todayStats: DailyStats;
  statsOverview: StatsOverview;
  dailyRecords: DailyDetailRecord[];
  trend: TrendPoint[];
  canRunReminders: boolean;
  scheduleReason: 'weekday' | 'weekend' | 'day-off' | 'before-work' | 'after-work' | 'lunch';
  remainingSeconds: number | null;
  countdownDurationSeconds: number | null;
  nextReminderAtIso: string | null;
  pauseUntilIso: string | null;
  mutedToday: boolean;
  isOvertime: boolean;
  overtimeAutoEndSeconds: number | null;
  consecutiveSnoozes: number;
  currentCompletionStreak: number;
  imageFallbackActive: boolean;
  daySession: DaySession;
  dailyPoem: DailyPoem | null;
  dailyPoemRefresh: DailyPoemRefreshState;
  fullscreenRest: FullscreenRestState | null;
  restExercise: RestExercise | null;
  focusContext: FocusContextState;
  idleSeconds: number;
  imageRevision: number;
}

export type RealtimeSnapshot = Omit<AppSnapshot, 'dailyRecords' | 'trend'>;
export type HistorySnapshot = Pick<AppSnapshot, 'dailyRecords' | 'trend'>;

export type CountdownAction = 'start-rest' | 'snooze' | 'skip' | 'timeout';

export interface ImageSelectionResult {
  cancelled: boolean;
  settings: AppSettings;
}
