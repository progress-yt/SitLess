import { getScheduleStatus, type ScheduleStatus } from './schedule';
import type { AppSettings, AppStatus, DaySession } from './types';

export interface WorkdayGateStatus {
  canRunReminders: boolean;
  status: AppStatus | 'ready';
  schedule: ScheduleStatus;
}

export function getWorkdayGateStatus(date: Date, settings: AppSettings, daySession: DaySession): WorkdayGateStatus {
  const schedule = getScheduleStatus(date, settings);

  if (schedule.reason === 'weekend' || schedule.reason === 'before-work') {
    return { canRunReminders: false, status: 'outside-schedule', schedule };
  }

  if (daySession.status === 'off-work') {
    return { canRunReminders: false, status: 'off-work', schedule };
  }

  if (daySession.status !== 'working') {
    // If work was never started and we're already past the end time, treat as outside-schedule
    if (schedule.reason === 'after-work') {
      return { canRunReminders: false, status: 'outside-schedule', schedule };
    }
    return { canRunReminders: false, status: 'awaiting-work-start', schedule };
  }

  if (schedule.reason === 'lunch') {
    return { canRunReminders: false, status: 'lunch-break', schedule };
  }

  return { canRunReminders: true, status: 'ready', schedule };
}
