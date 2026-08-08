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

  it('uses an enabled weekend schedule', () => {
    const settings = createDefaultSettings();
    settings.weeklySchedule.saturday = { enabled: true, start: '10:00', end: '16:00' };

    expect(getScheduleStatus(new Date('2026-06-06T11:00:00'), settings)).toEqual({
      within: true,
      reason: 'weekday'
    });
  });

  it('uses a date override before the weekly schedule', () => {
    const settings = createDefaultSettings();
    settings.scheduleOverrides = [{
      dateKey: '2026-06-10',
      enabled: false,
      start: '09:00',
      end: '18:00',
      label: '调休'
    }];

    expect(getScheduleStatus(new Date('2026-06-10T10:00:00'), settings)).toEqual({
      within: false,
      reason: 'day-off'
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
