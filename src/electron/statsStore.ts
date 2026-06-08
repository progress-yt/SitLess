import { app } from 'electron';
import { join } from 'node:path';
import { createEmptyDailyStats } from '../shared/defaults';
import { getDateKey } from '../shared/schedule';
import type { DailyStats, WorkdayStatus } from '../shared/types';
import { readJsonFile, writeJsonFile } from './jsonStore';

type StatsFile = Record<string, DailyStats>;
type StatField = 'reminders' | 'completed' | 'skipped';

export class StatsStore {
  private readonly filePath: string;
  private stats: StatsFile;

  constructor() {
    this.filePath = join(app.getPath('userData'), 'stats.json');
    this.stats = readJsonFile(this.filePath, {});
  }

  getToday(date = new Date()): DailyStats {
    const key = getDateKey(date);
    return {
      ...createEmptyDailyStats(),
      ...this.stats[key]
    };
  }

  increment(field: StatField, date = new Date()): DailyStats {
    const key = getDateKey(date);
    const day = this.getToday(date);

    day[field] += 1;
    this.stats[key] = day;
    this.persist();
    return this.getToday(date);
  }

  setWorkdayStatus(status: WorkdayStatus, date = new Date()): DailyStats {
    const key = getDateKey(date);
    this.stats[key] = {
      ...this.getToday(date),
      workdayStatus: status
    };
    this.persist();
    return this.getToday(date);
  }

  private persist(): void {
    writeJsonFile(this.filePath, this.stats);
  }
}
