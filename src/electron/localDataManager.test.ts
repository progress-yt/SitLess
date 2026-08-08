import { describe, expect, it } from 'vitest';
import { createEmptyDailyStats } from '../shared/defaults';
import { toStatsCsv, validateReminderImage } from './localDataManager';

describe('CSV export', () => {
  it('exports chronological normalized statistics with an Excel-friendly BOM', () => {
    const csv = toStatsCsv({
      '2026-06-10': { ...createEmptyDailyStats(), reminders: 2, completed: 1 }
    });
    expect(csv.startsWith('\uFEFF日期,提醒')).toBe(true);
    expect(csv).toContain('2026-06-10,2,1,0,0,0,0,0,0');
  });
});

describe('backup reminder image validation', () => {
  it('checks bitmap signatures instead of trusting extensions', () => {
    expect(validateReminderImage('.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
    expect(validateReminderImage('.png', Buffer.from('not-a-png'))).toBe(false);
  });

  it('rejects active content in SVG images', () => {
    expect(validateReminderImage('.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>'))).toBe(true);
    expect(validateReminderImage('.svg', Buffer.from('<svg onload="alert(1)"><script>alert(1)</script></svg>'))).toBe(false);
  });
});
