import { describe, expect, it } from 'vitest';
import { createDefaultSettings } from './defaults';
import { getScheduleStatus, isInTimeRange, parseTimeToMinutes } from './schedule';

describe('schedule helpers', () => {
  it('parses HH:mm values into minutes', () => {
    expect(parseTimeToMinutes('09:30')).toBe(570);
    expect(parseTimeToMinutes('23:59')).toBe(1439);
  });

  it('detects normal time ranges', () => {
    expect(isInTimeRange(9 * 60, '09:00', '18:00')).toBe(true);
    expect(isInTimeRange(18 * 60, '09:00', '18:00')).toBe(false);
  });

  it('excludes weekends', () => {
    const settings = createDefaultSettings();
    expect(getScheduleStatus(new Date('2026-06-06T10:00:00'), settings)).toEqual({
      within: false,
      reason: 'weekend'
    });
  });

  it('allows weekday work time outside lunch', () => {
    const settings = createDefaultSettings();
    expect(getScheduleStatus(new Date('2026-06-05T10:00:00'), settings)).toEqual({
      within: true,
      reason: 'weekday'
    });
  });

  it('excludes the configured lunch break', () => {
    const settings = createDefaultSettings();
    expect(getScheduleStatus(new Date('2026-06-05T12:30:00'), settings)).toEqual({
      within: false,
      reason: 'lunch'
    });
  });
});
