import { describe, expect, it } from 'vitest';
import { createEmptyDailyStats } from '../shared/defaults';
import { toStatsCsv } from './localDataManager';

describe('CSV export', () => {
  it('exports chronological normalized statistics with an Excel-friendly BOM', () => {
    const csv = toStatsCsv({
      '2026-06-10': { ...createEmptyDailyStats(), reminders: 2, completed: 1 }
    });
    expect(csv.startsWith('\uFEFF日期,提醒')).toBe(true);
    expect(csv).toContain('2026-06-10,2,1,0,0,0,0,0,0');
  });
});
