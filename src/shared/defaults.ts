import type {
  AppSettings,
  DailyPoem,
  DailyStats,
  DaySession,
  ReminderRuntimeState,
  StatsOverview,
  StatsPeriod,
  StatsSummary
} from './types';

export const DEFAULT_REST_PROMPT_OPTIONS = [
  '该起身活动一下了',
  '站起来，伸展肩颈',
  '离开屏幕，走动两分钟',
  '喝口水，放松眼睛',
  '调整坐姿，活动身体'
];

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
  restPromptText: DEFAULT_REST_PROMPT_OPTIONS[0],
  updatedAtIso: new Date(0).toISOString()
};

export const EMPTY_DAILY_STATS: DailyStats = {
  reminders: 0,
  completed: 0,
  skipped: 0
};

export const EMPTY_DAY_SESSION: DaySession = {
  status: 'not-started',
  startedAtIso: null,
  endedAtIso: null,
  startPromptedAtIso: null
};

export const EMPTY_RUNTIME_STATE: ReminderRuntimeState = {
  pauseUntilIso: null,
  mutedDateKey: null
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
    completionRate: 0
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
