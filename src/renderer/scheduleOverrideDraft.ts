import { getDateKey } from '../shared/schedule';
import type { ScheduleOverride } from '../shared/types';

export function createScheduleOverrideDraft(date = new Date()): ScheduleOverride {
  return {
    dateKey: getDateKey(date),
    enabled: false,
    start: '09:00',
    end: '18:00',
    label: ''
  };
}
