import { app } from 'electron';
import { join } from 'node:path';
import { createEmptyDailyStats } from '../shared/defaults';
import { normalizeCount, normalizeDailyStats, normalizeStatsFile } from '../shared/persistence';
import { getDateKey, getRecentDateKeys } from '../shared/schedule';
import { createStatsOverview } from '../shared/stats';
import type { DailyStats, DailyStatsFile, StatsOverview } from '../shared/types';
import { readJsonFile, writeJsonFile } from './jsonStore';

export type ReminderOutcome = 'completed' | 'skipped' | 'snoozed' | 'interrupted';

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

  incrementReminder(date = new Date()): DailyStats {
    const key = getDateKey(date);
    const day = this.getToday(date);

    day.reminders += 1;
    this.stats[key] = day;
    this.persist();
    return this.getToday(date);
  }

  recordOutcome(outcome: ReminderOutcome, date = new Date()): DailyStats {
    const key = getDateKey(date);
    const day = this.getToday(date);

    day[outcome] += 1;
    day.currentCompletionStreak = outcome === 'completed'
      ? day.currentCompletionStreak + 1
      : 0;
    this.stats[key] = day;
    this.persist();
    return this.getToday(date);
  }

  addRestSeconds(seconds: number, date = new Date()): DailyStats {
    const key = getDateKey(date);
    const day = this.getToday(date);

    day.restSeconds += normalizeCount(seconds);
    this.stats[key] = day;
    this.persist();
    return this.getToday(date);
  }

  recordFocusSeconds(seconds: number, date = new Date()): DailyStats {
    const key = getDateKey(date);
    const day = this.getToday(date);

    day.longestFocusSeconds = Math.max(day.longestFocusSeconds, normalizeCount(seconds));
    this.stats[key] = day;
    this.persist();
    return this.getToday(date);
  }

  setDay(dateKey: string, stats: DailyStats): DailyStats {
    const next = normalizeDailyStats(stats);
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
