import type { AppSettings, DailyScheduleSettings, WeekdayKey } from './types';

export interface ScheduleStatus {
  within: boolean;
  reason: 'weekday' | 'weekend' | 'day-off' | 'before-work' | 'after-work' | 'lunch';
}

const WEEKDAY_KEYS: WeekdayKey[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export function getEffectiveSchedule(date: Date, settings: AppSettings): DailyScheduleSettings {
  const override = settings.scheduleOverrides.find((candidate) => candidate.dateKey === getDateKey(date));
  if (override) {
    return { enabled: override.enabled, start: override.start, end: override.end };
  }
  return settings.weeklySchedule[WEEKDAY_KEYS[date.getDay()]];
}

export function getDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseTimeToMinutes(value: string): number {
  const [hours = '0', minutes = '0'] = value.split(':');
  const parsedHours = clampNumber(Number(hours), 0, 23);
  const parsedMinutes = clampNumber(Number(minutes), 0, 59);
  return parsedHours * 60 + parsedMinutes;
}

export function getMinutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

export function isInTimeRange(minutes: number, start: string, end: string): boolean {
  const startMinutes = parseTimeToMinutes(start);
  const endMinutes = parseTimeToMinutes(end);

  if (startMinutes === endMinutes) {
    return false;
  }

  if (startMinutes < endMinutes) {
    return minutes >= startMinutes && minutes < endMinutes;
  }

  return minutes >= startMinutes || minutes < endMinutes;
}

export function getScheduleStatus(date: Date, settings: AppSettings): ScheduleStatus {
  const day = date.getDay();
  const dailySchedule = getEffectiveSchedule(date, settings);
  if (!dailySchedule.enabled) {
    return { within: false, reason: day === 0 || day === 6 ? 'weekend' : 'day-off' };
  }

  const minutes = getMinutesOfDay(date);
  const workStart = parseTimeToMinutes(dailySchedule.start);
  const workEnd = parseTimeToMinutes(dailySchedule.end);

  if (!isInTimeRange(minutes, dailySchedule.start, dailySchedule.end)) {
    if (workStart < workEnd) {
      return {
        within: false,
        reason: minutes < workStart ? 'before-work' : 'after-work'
      };
    }

    // Cross-midnight schedule: non-work gap is [workEnd, workStart).
    // Split at the midpoint to distinguish "just ended" from "about to start".
    const midpoint = Math.floor((workEnd + workStart) / 2);
    return {
      within: false,
      reason: minutes < midpoint ? 'after-work' : 'before-work'
    };
  }

  const lunch = settings.workSchedule.lunch;
  if (lunch.enabled && isInTimeRange(minutes, lunch.start, lunch.end)) {
    return { within: false, reason: 'lunch' };
  }

  return { within: true, reason: 'weekday' };
}

export function clampNumber(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}

export function secondsUntil(date: Date, timestamp: number): number {
  return Math.max(0, Math.ceil((timestamp - date.getTime()) / 1000));
}

export function getRecentDateKeys(limit: number, date: Date): string[] {
  const days = Math.max(1, Math.floor(limit));
  return Array.from({ length: days }, (_value, index) => {
    const current = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    current.setDate(current.getDate() - index);
    return getDateKey(current);
  });
}
