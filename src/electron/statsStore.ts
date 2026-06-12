import { app } from 'electron';
import { join } from 'node:path';
import { createEmptyDailyStats } from '../shared/defaults';
import { getDateKey } from '../shared/schedule';
import { createStatsOverview, type DailyStatsFile } from '../shared/stats';
import type { DailyStats, StatsOverview } from '../shared/types';
import { readJsonFile, writeJsonFile } from './jsonStore';

type StatField = 'reminders' | 'completed' | 'skipped';

export class StatsStore {
  private readonly filePath: string;
  private stats: DailyStatsFile;

  constructor() {
    this.filePath = join(app.getPath('userData'), 'stats.json');
    this.stats = normalizeStatsFile(readJsonFile(this.filePath, {}));
  }

  getToday(date = new Date()): DailyStats {
    const key = getDateKey(date);
    return {
      ...createEmptyDailyStats(),
      ...this.stats[key]
    };
  }

  getOverview(date = new Date()): StatsOverview {
    return createStatsOverview(this.stats, date);
  }

  getRecentDays(limit = 30, date = new Date()): DailyStatsFile {
    const keys = getRecentDateKeys(limit, date);
    return keys.reduce<DailyStatsFile>((records, key) => {
      records[key] = {
        ...createEmptyDailyStats(),
        ...this.stats[key]
      };
      return records;
    }, {});
  }

  increment(field: StatField, date = new Date()): DailyStats {
    const key = getDateKey(date);
    const day = this.getToday(date);

    day[field] += 1;
    this.stats[key] = day;
    this.persist();
    return this.getToday(date);
  }

  setDay(dateKey: string, stats: DailyStats): DailyStats {
    const next: DailyStats = {
      reminders: normalizeCount(stats.reminders),
      completed: normalizeCount(stats.completed),
      skipped: normalizeCount(stats.skipped)
    };
    this.stats[dateKey] = next;
    this.persist();
    return {
      ...createEmptyDailyStats(),
      ...next
    };
  }

  private persist(): void {
    writeJsonFile(this.filePath, this.stats);
  }
}

function normalizeCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function normalizeStatsFile(value: unknown): DailyStatsFile {
  if (!isRecord(value)) {
    return {};
  }

  return Object.entries(value).reduce<DailyStatsFile>((records, [dateKey, stats]) => {
    if (!isRecord(stats)) {
      return records;
    }

    records[dateKey] = {
      reminders: normalizeCount(Number(stats.reminders)),
      completed: normalizeCount(Number(stats.completed)),
      skipped: normalizeCount(Number(stats.skipped))
    };
    return records;
  }, {});
}

function getRecentDateKeys(limit: number, date: Date): string[] {
  const days = Math.max(1, Math.floor(limit));
  return Array.from({ length: days }, (_value, index) => {
    const current = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    current.setDate(current.getDate() - index);
    return getDateKey(current);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
