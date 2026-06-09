import { describe, expect, it } from 'vitest';
import { createDefaultSettings } from './defaults';
import { evaluateReminderEngine } from './reminderEngine';

describe('reminder engine', () => {
  it('resets active mode when idle time is over the configured threshold', () => {
    const settings = createDefaultSettings();
    const result = evaluateReminderEngine({
      nowMs: 1_000,
      cycleStartedAt: 0,
      idleSeconds: settings.idleResetMinutes * 60 + 1,
      settings
    });

    expect(result).toEqual({
      action: 'emit',
      status: 'idle-reset',
      remainingSeconds: settings.activeThresholdMinutes * 60,
      cycleStartedAt: null
    });
  });

  it('counts down from the active threshold', () => {
    const settings = createDefaultSettings();
    const result = evaluateReminderEngine({
      nowMs: 30_000,
      cycleStartedAt: 0,
      idleSeconds: 0,
      settings
    });

    expect(result).toMatchObject({
      action: 'emit',
      status: 'counting',
      remainingSeconds: settings.activeThresholdMinutes * 60 - 30
    });
  });

  it('triggers when the active threshold has elapsed', () => {
    const settings = createDefaultSettings();
    const result = evaluateReminderEngine({
      nowMs: settings.activeThresholdMinutes * 60 * 1000,
      cycleStartedAt: 0,
      idleSeconds: 0,
      settings
    });

    expect(result).toEqual({
      action: 'trigger',
      cycleStartedAt: 0
    });
  });

  it('uses the fixed interval threshold in fixed mode', () => {
    const settings = {
      ...createDefaultSettings(),
      mode: 'fixed' as const,
      fixedIntervalMinutes: 10
    };
    const result = evaluateReminderEngine({
      nowMs: 60_000,
      cycleStartedAt: 0,
      idleSeconds: 9999,
      settings
    });

    expect(result).toMatchObject({
      action: 'emit',
      status: 'counting',
      remainingSeconds: 9 * 60
    });
  });
});
