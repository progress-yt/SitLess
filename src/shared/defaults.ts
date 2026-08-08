import type {
  AppSettings,
  BuiltInReminderImage,
  BuiltInReminderImageId,
  DailyPoem,
  DailyStats,
  DaySession,
  ReminderRuntimeState,
  RestExercise,
  StatsOverview,
  StatsPeriod,
  StatsSummary
} from './types';

export const REST_EXERCISES: RestExercise[] = [
  { id: 'eyes-20', title: '远眺放松', instruction: '看向远处 20 秒，缓慢眨眼，让视线离开屏幕。', target: 'eyes' },
  { id: 'neck-turn', title: '肩颈舒展', instruction: '放松双肩，头部缓慢向左右转动，各停留 5 秒。', target: 'neck' },
  { id: 'back-open', title: '打开胸背', instruction: '双手在身后相扣，轻轻打开胸口并保持自然呼吸。', target: 'back' },
  { id: 'leg-walk', title: '起身走动', instruction: '离开座位走动一分钟，让腿部重新活动起来。', target: 'legs' },
  { id: 'breathing', title: '深呼吸', instruction: '吸气 4 秒、停留 2 秒、呼气 6 秒，重复三次。', target: 'breathing' }
];

export const DEFAULT_REST_PROMPT_OPTIONS = [
  '该起身活动一下了',
  '站起来，伸展肩颈',
  '离开屏幕，走动两分钟',
  '喝口水，放松眼睛',
  '调整坐姿，活动身体'
];

export const BUILT_IN_REMINDER_IMAGES: BuiltInReminderImage[] = [
  {
    id: 'desk',
    label: '办公桌',
    description: '柔和室内场景',
    assetFilename: 'default-reminder.svg'
  },
  {
    id: 'walk',
    label: '散步',
    description: '户外走动场景',
    assetFilename: 'default-reminder-walk.svg'
  },
  {
    id: 'photo-1',
    label: '照片 1',
    description: '真实办公空间',
    assetFilename: 'reminder-photo-1.png'
  },
  {
    id: 'photo-2',
    label: '照片 2',
    description: '阳光休息提醒',
    assetFilename: 'reminder-photo-2.png'
  }
];

export const DEFAULT_BUILT_IN_REMINDER_IMAGE_ID: BuiltInReminderImageId = 'desk';

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
  weeklySchedule: {
    monday: { enabled: true, start: '09:00', end: '18:00' },
    tuesday: { enabled: true, start: '09:00', end: '18:00' },
    wednesday: { enabled: true, start: '09:00', end: '18:00' },
    thursday: { enabled: true, start: '09:00', end: '18:00' },
    friday: { enabled: true, start: '09:00', end: '18:00' },
    saturday: { enabled: false, start: '09:00', end: '18:00' },
    sunday: { enabled: false, start: '09:00', end: '18:00' }
  },
  scheduleOverrides: [],
  activeThresholdMinutes: 45,
  fixedIntervalMinutes: 45,
  idleResetMinutes: 5,
  overtimeAutoEndMinutes: 60,
  snoozeMinutes: 10,
  countdownSeconds: 10,
  minimumRestSeconds: 60,
  reminderStrength: 'standard',
  workdayPromptSnoozeMinutes: 15,
  soundEnabled: true,
  respectFocusContext: true,
  guidedRestEnabled: true,
  automaticUpdatesEnabled: true,
  launchAtStartup: false,
  hasSeenStartupPrompt: false,
  customReminderImagePath: null,
  builtInReminderImageId: DEFAULT_BUILT_IN_REMINDER_IMAGE_ID,
  restPromptText: DEFAULT_REST_PROMPT_OPTIONS[0],
  restStartButtonText: '起身休息一会儿',
  restCompleteButtonText: '我已回来',
  restInterruptButtonText: '临时返回工作',
  updatedAtIso: new Date(0).toISOString()
};

export const EMPTY_DAILY_STATS: DailyStats = {
  reminders: 0,
  completed: 0,
  skipped: 0,
  snoozed: 0,
  interrupted: 0,
  restSeconds: 0,
  longestFocusSeconds: 0,
  currentCompletionStreak: 0
};

export const EMPTY_DAY_SESSION: DaySession = {
  status: 'not-started',
  startedAtIso: null,
  endedAtIso: null,
  startPromptedAtIso: null
};

export const EMPTY_RUNTIME_STATE: ReminderRuntimeState = {
  pauseUntilIso: null,
  mutedDateKey: null,
  cycleStartedAtIso: null,
  snoozeUntilIso: null,
  reminderStartedAtIso: null,
  reminderPhase: 'running',
  consecutiveSnoozes: 0
};

export function createFallbackDailyPoem(dateKey: string): DailyPoem {
  const fallbackPoems = [
    {
      content: '纸上得来终觉浅，绝知此事要躬行。',
      author: '陆游',
      title: '冬夜读书示子聿'
    },
    {
      content: '会当凌绝顶，一览众山小。',
      author: '杜甫',
      title: '望岳'
    },
    {
      content: '海日生残夜，江春入旧年。',
      author: '王湾',
      title: '次北固山下'
    },
    {
      content: '欲穷千里目，更上一层楼。',
      author: '王之涣',
      title: '登鹳雀楼'
    },
    {
      content: '采菊东篱下，悠然见南山。',
      author: '陶渊明',
      title: '饮酒'
    },
    {
      content: '长风破浪会有时，直挂云帆济沧海。',
      author: '李白',
      title: '行路难'
    },
    {
      content: '山重水复疑无路，柳暗花明又一村。',
      author: '陆游',
      title: '游山西村'
    }
  ];
  const poem = fallbackPoems[getStableDateIndex(dateKey, fallbackPoems.length)];

  return {
    dateKey,
    content: poem.content,
    author: poem.author,
    title: poem.title,
    source: 'fallback'
  };
}

export function createDefaultSettings(): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    workSchedule: {
      ...DEFAULT_SETTINGS.workSchedule,
      lunch: { ...DEFAULT_SETTINGS.workSchedule.lunch }
    },
    weeklySchedule: Object.fromEntries(
      Object.entries(DEFAULT_SETTINGS.weeklySchedule).map(([key, value]) => [key, { ...value }])
    ) as AppSettings['weeklySchedule'],
    scheduleOverrides: DEFAULT_SETTINGS.scheduleOverrides.map((override) => ({ ...override })),
    updatedAtIso: new Date().toISOString()
  };
}

export function createEmptyDailyStats(): DailyStats {
  return { ...EMPTY_DAILY_STATS };
}

export function createEmptyStatsSummary(
  period: StatsPeriod,
  startDateKey: string,
  endDateKey: string
): StatsSummary {
  return {
    ...EMPTY_DAILY_STATS,
    period,
    startDateKey,
    endDateKey,
    activeDays: 0,
    completionRate: 0,
    currentCompletionStreak: 0
  };
}

export function createEmptyStatsOverview(dateKey: string): StatsOverview {
  return {
    day: createEmptyStatsSummary('day', dateKey, dateKey),
    week: createEmptyStatsSummary('week', dateKey, dateKey),
    month: createEmptyStatsSummary('month', dateKey, dateKey)
  };
}

export function createEmptyDaySession(): DaySession {
  return { ...EMPTY_DAY_SESSION };
}

export function createEmptyRuntimeState(): ReminderRuntimeState {
  return { ...EMPTY_RUNTIME_STATE };
}

function getStableDateIndex(dateKey: string, modulo: number): number {
  const parsed = new Date(`${dateKey}T00:00:00`).getTime();
  if (!Number.isFinite(parsed) || modulo <= 0) {
    return 0;
  }

  return Math.floor(parsed / (24 * 60 * 60 * 1000)) % modulo;
}
