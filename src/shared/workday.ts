import { getScheduleStatus, type ScheduleStatus } from './schedule';
import type { AppSettings, AppStatus, WorkdayStatus } from './types';

export interface WorkdayGateStatus {
  canRunReminders: boolean;
  status: AppStatus | 'ready';
  schedule: ScheduleStatus;
}

export function getWorkdayGateStatus(date: Date, settings: AppSettings, workdayStatus: WorkdayStatus): WorkdayGateStatus {
  const schedule = getScheduleStatus(date, settings);

  if (schedule.reason === 'weekend' || schedule.reason === 'before-work') {
    return { canRunReminders: false, status: 'outside-schedule', schedule };
  }

  if (workdayStatus === 'off-work') {
    return { canRunReminders: false, status: 'off-work', schedule };
  }

  if (workdayStatus !== 'working') {
    return { canRunReminders: false, status: 'awaiting-work-start', schedule };
  }

  if (schedule.reason === 'lunch') {
    return { canRunReminders: false, status: 'lunch-break', schedule };
  }

  return { canRunReminders: true, status: 'ready', schedule };
}
