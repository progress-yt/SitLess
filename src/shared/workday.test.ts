import { describe, expect, it } from 'vitest';
import { createDefaultSettings } from './defaults';
import { getWorkdayGateStatus } from './workday';

describe('workday gate', () => {
  it('waits for work confirmation after the fixed start time', () => {
    const settings = createDefaultSettings();
    const gate = getWorkdayGateStatus(new Date('2026-06-05T09:10:00'), settings, {
      status: 'not-started',
      startedAtIso: null,
      endedAtIso: null,
      startPromptedAtIso: null
    });

    expect(gate.canRunReminders).toBe(false);
    expect(gate.status).toBe('awaiting-work-start');
  });

  it('shows lunch break instead of work confirmation during lunch', () => {
    const settings = createDefaultSettings();
    const gate = getWorkdayGateStatus(new Date('2026-06-05T12:30:00'), settings, {
      status: 'not-started',
      startedAtIso: null,
      endedAtIso: null,
      startPromptedAtIso: null
    });

    expect(gate.canRunReminders).toBe(false);
    expect(gate.status).toBe('lunch-break');
  });

  it('runs reminders after work is confirmed', () => {
    const settings = createDefaultSettings();
    const gate = getWorkdayGateStatus(new Date('2026-06-05T09:10:00'), settings, {
      status: 'working',
      startedAtIso: '2026-06-05T09:00:00.000Z',
      endedAtIso: null,
      startPromptedAtIso: null
    });

    expect(gate.canRunReminders).toBe(true);
    expect(gate.status).toBe('ready');
  });

  it('keeps reminders running after the configured end time while still working', () => {
    const settings = createDefaultSettings();
    const gate = getWorkdayGateStatus(new Date('2026-06-05T19:30:00'), settings, {
      status: 'working',
      startedAtIso: '2026-06-05T09:00:00.000Z',
      endedAtIso: null,
      startPromptedAtIso: null
    });

    expect(gate.canRunReminders).toBe(true);
    expect(gate.status).toBe('ready');
  });

  it('stops reminders after work is finished for the day', () => {
    const settings = createDefaultSettings();
    const gate = getWorkdayGateStatus(new Date('2026-06-05T19:30:00'), settings, {
      status: 'off-work',
      startedAtIso: '2026-06-05T09:00:00.000Z',
      endedAtIso: '2026-06-05T18:30:00.000Z',
      startPromptedAtIso: null
    });

    expect(gate.canRunReminders).toBe(false);
    expect(gate.status).toBe('off-work');
  });
});
