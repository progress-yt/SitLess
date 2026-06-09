import { createEmptyStatsSummary } from './defaults';
import { getDateKey } from './schedule';
import type { DailyStats, StatsOverview, StatsPeriod, StatsSummary } from './types';

export type DailyStatsFile = Record<string, DailyStats>;

export function createStatsOverview(stats: DailyStatsFile, date = new Date()): StatsOverview {
  return {
    day: createStatsSummary(stats, 'day', date),
    week: createStatsSummary(stats, 'week', date),
    month: createStatsSummary(stats, 'month', date)
  };
}

export function createStatsSummary(stats: DailyStatsFile, period: StatsPeriod, date = new Date()): StatsSummary {
  const bounds = getPeriodBounds(period, date);
  const summary = createEmptyStatsSummary(period, getDateKey(bounds.start), getDateKey(bounds.end));

  for (const key of eachDateKey(bounds.start, bounds.end)) {
    const day = stats[key];
    if (!day) {
      continue;
    }

    summary.reminders += normalizeCount(day.reminders);
    summary.completed += normalizeCount(day.completed);
    summary.skipped += normalizeCount(day.skipped);

    if (hasActivity(day)) {
      summary.activeDays += 1;
    }
  }

  summary.completionRate = summary.reminders > 0 ? summary.completed / summary.reminders : 0;
  return summary;
}

function getPeriodBounds(period: StatsPeriod, date: Date): { start: Date; end: Date } {
  const end = startOfDay(date);
  if (period === 'day') {
    return { start: startOfDay(date), end };
  }

  if (period === 'week') {
    const start = startOfDay(date);
    const day = start.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + mondayOffset);
    return { start, end };
  }

  return {
    start: new Date(date.getFullYear(), date.getMonth(), 1),
    end
  };
}

function* eachDateKey(start: Date, end: Date): Generator<string> {
  const current = startOfDay(start);
  const final = startOfDay(end);

  while (current.getTime() <= final.getTime()) {
    yield getDateKey(current);
    current.setDate(current.getDate() + 1);
  }
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function hasActivity(day: DailyStats): boolean {
  return normalizeCount(day.reminders) + normalizeCount(day.completed) + normalizeCount(day.skipped) > 0;
}

function normalizeCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}
