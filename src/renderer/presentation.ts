import type {
  AppSettings,
  AppSnapshot,
  AppStatus,
  DailyPoemRefreshStatus,
  BuiltInReminderImageId,
  ReminderMode,
  StatsPeriod
} from '../shared/types';
import defaultReminderUrl from '../../assets/default-reminder.svg?url';
import walkReminderUrl from '../../assets/default-reminder-walk.svg?url';
import reminderPhoto1Url from '../../assets/reminder-photo-1.png?url';
import reminderPhoto2Url from '../../assets/reminder-photo-2.png?url';

export type ViewName = 'main' | 'countdown' | 'fullscreen';

const BUILT_IN_REMINDER_PREVIEW_URLS: Record<BuiltInReminderImageId, string> = {
  desk: defaultReminderUrl,
  walk: walkReminderUrl,
  'photo-1': reminderPhoto1Url,
  'photo-2': reminderPhoto2Url
};

export const STATUS_DETAIL: Record<AppStatus, string> = {
  'outside-schedule': '进入工作时间后重新计时',
  'lunch-break': '午休结束后重新计时',
  'awaiting-work-start': '确认今天已上班后开始提醒',
  counting: '当前提醒规则正在运行',
  'idle-reset': '检测到离开电脑，等待新的键鼠活动',
  snoozed: '稍后会再次提醒',
  paused: '暂停结束后重新计时',
  'muted-today': '下一个工作日恢复提醒',
  'off-work': '今天已停止提醒，可继续加班提醒',
  countdown: '提醒已触发',
  fullscreen: '休息满时长后计入完成'
};

const STATUS_LABELS: Record<AppStatus, string> = {
  'outside-schedule': '不在提醒时段',
  'lunch-break': '午休不提醒',
  'awaiting-work-start': '等待上班确认',
  counting: '计时中',
  'idle-reset': '等待键鼠活动',
  snoozed: '稍后提醒',
  paused: '已暂停',
  'muted-today': '今日不再提醒',
  'off-work': '已下班',
  countdown: '等待处理',
  fullscreen: '休息中'
};

export function getViewName(): ViewName {
  const value = new URLSearchParams(window.location.search).get('view');
  return value === 'countdown' || value === 'fullscreen' ? value : 'main';
}

export function getReminderImageUrl(snapshot: AppSnapshot): string {
  if (window.sitless) {
    return `sitless://reminder-image/current?revision=${snapshot.imageRevision}`;
  }
  return getBuiltInReminderImageUrl(snapshot.settings.builtInReminderImageId);
}

export function getBuiltInReminderImageUrl(imageId: AppSettings['builtInReminderImageId']): string {
  return BUILT_IN_REMINDER_PREVIEW_URLS[imageId] ?? defaultReminderUrl;
}

export function getStatusTone(status: AppStatus): string {
  if (status === 'counting') {
    return 'tone-active';
  }
  if (status === 'countdown' || status === 'fullscreen') {
    return 'tone-alert';
  }
  if (status === 'paused' || status === 'snoozed' || status === 'muted-today' || status === 'off-work') {
    return 'tone-paused';
  }
  return 'tone-quiet';
}

export function getStatusTitle(snapshot: AppSnapshot): string {
  return snapshot.isOvertime && snapshot.status === 'counting'
    ? '加班提醒中'
    : STATUS_LABELS[snapshot.status];
}

export function getRemainingLabel(snapshot: AppSnapshot): string {
  if (snapshot.remainingSeconds !== null) {
    return formatDuration(snapshot.remainingSeconds);
  }

  switch (snapshot.status) {
    case 'muted-today':
      return '今天已关闭';
    case 'awaiting-work-start':
      return '待确认';
    case 'off-work':
      return '已结束';
    case 'lunch-break':
      return '午休中';
    case 'outside-schedule':
      return '未计时';
    default:
      return STATUS_LABELS[snapshot.status];
  }
}

export function getScheduleLabel(snapshot: AppSnapshot): string {
  if (snapshot.status === 'paused' && snapshot.pauseUntilIso) {
    return `恢复 ${formatClock(new Date(snapshot.pauseUntilIso))}`;
  }
  if (snapshot.isOvertime && snapshot.overtimeAutoEndSeconds !== null) {
    return `无输入 ${formatDuration(snapshot.overtimeAutoEndSeconds)} 后自动下班`;
  }
  if (snapshot.scheduleReason === 'weekend') {
    return '周末';
  }
  if (snapshot.scheduleReason === 'lunch') {
    return `${snapshot.settings.workSchedule.lunch.start}-${snapshot.settings.workSchedule.lunch.end}`;
  }
  return `${snapshot.settings.workSchedule.start}-${snapshot.settings.workSchedule.end}`;
}

export function getWorkdayLabel(snapshot: AppSnapshot): string {
  if (snapshot.isOvertime) {
    return '加班提醒中';
  }
  if (snapshot.daySession.status === 'working') {
    return '提醒运行中';
  }
  if (snapshot.daySession.status === 'off-work') {
    return '当天已结束';
  }
  return snapshot.scheduleReason === 'before-work' ? '上班前' : '待确认';
}

export function getProgress(snapshot: AppSnapshot): number {
  const threshold = snapshot.settings.mode === 'active'
    ? snapshot.settings.activeThresholdMinutes * 60
    : snapshot.settings.fixedIntervalMinutes * 60;
  if (snapshot.status !== 'counting' || snapshot.remainingSeconds === null) {
    return 0;
  }
  return Math.max(0, Math.min(100, ((threshold - snapshot.remainingSeconds) / threshold) * 100));
}

export function getModeTitle(mode: ReminderMode): string {
  return mode === 'active' ? '连续活跃' : '固定间隔';
}

export function getModeSummary(settings: AppSettings): string {
  return settings.mode === 'active'
    ? `持续检测键盘和鼠标输入，连续活跃 ${settings.activeThresholdMinutes} 分钟后触发提醒。`
    : `从开始工作或上次处理提醒后计时，每隔 ${settings.fixedIntervalMinutes} 分钟触发一次提醒。`;
}

export function getModeDetail(settings: AppSettings): string {
  return settings.mode === 'active'
    ? `如果中途无输入超过 ${settings.idleResetMinutes} 分钟，系统会认为你离开了电脑，本轮久坐计时重新开始。适合想按真实电脑使用状态提醒的场景。`
    : '固定间隔不根据短暂空闲重置计时，提醒节奏更稳定。适合希望按固定节奏起身，或不想让键鼠检测影响提醒时间的场景。';
}

export function getModeOptionDescription(mode: ReminderMode): string {
  return mode === 'active'
    ? '按键鼠活跃判断，离开电脑会重置'
    : '按固定分钟数提醒，不受短暂空闲影响';
}

export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, totalSeconds);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

export function formatClock(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function formatPoemSource(poem: NonNullable<AppSnapshot['dailyPoem']>): string {
  const source = [poem.author, poem.title ? `《${poem.title}》` : null].filter(Boolean).join(' ');
  return source || '今日诗词';
}

export function getFullscreenRestLabel(phase: NonNullable<AppSnapshot['fullscreenRest']>['phase'] | undefined): string {
  if (phase === 'resting') {
    return '休息中';
  }
  return phase === 'ready' ? '休息完成' : '休息提醒';
}

export function getPoemRefreshTitle(state: AppSnapshot['dailyPoemRefresh'], isRefreshing: boolean): string {
  if (isRefreshing) {
    return '正在刷新今日诗词';
  }
  return state.retryAfterSeconds > 0
    ? `${state.retryAfterSeconds} 秒后可再次刷新`
    : '刷新今日诗词';
}

export function getPoemRefreshFeedback(status: DailyPoemRefreshStatus, retryAfterSeconds: number): string {
  if (status === 'refreshed') {
    return '已刷新';
  }
  if (status === 'fallback') {
    return '远程不可用，已使用本地诗词';
  }
  return status === 'busy' ? '正在刷新' : `${retryAfterSeconds} 秒后可再次刷新`;
}

export function getStatsPeriodLabel(period: StatsPeriod): string {
  return period === 'week' ? '本周统计' : period === 'month' ? '本月统计' : '今日统计';
}

export function getStatsPeriodShortLabel(period: StatsPeriod): string {
  return period === 'week' ? '周' : period === 'month' ? '月' : '日';
}

export function formatPercent(value: number): string {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}
