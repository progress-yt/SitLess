import type { AppSettings, AppStatus } from './types';

export interface ReminderEngineInput {
  nowMs: number;
  cycleStartedAt: number | null;
  idleSeconds: number;
  settings: AppSettings;
}

export type ReminderEngineResult =
  | {
      action: 'emit';
      status: AppStatus;
      remainingSeconds: number;
      cycleStartedAt: number | null;
    }
  | {
      action: 'trigger';
      cycleStartedAt: number;
    };

export function evaluateReminderEngine(input: ReminderEngineInput): ReminderEngineResult {
  const { nowMs, idleSeconds, settings } = input;

  if (settings.mode === 'active') {
    const idleResetSeconds = settings.idleResetMinutes * 60;
    if (idleSeconds > idleResetSeconds) {
      return {
        action: 'emit',
        status: 'idle-reset',
        remainingSeconds: settings.activeThresholdMinutes * 60,
        cycleStartedAt: null
      };
    }
  }

  const thresholdSeconds = settings.mode === 'active'
    ? settings.activeThresholdMinutes * 60
    : settings.fixedIntervalMinutes * 60;
  const cycleStartedAt = input.cycleStartedAt ?? nowMs;
  const elapsedSeconds = Math.floor((nowMs - cycleStartedAt) / 1000);
  const remainingSeconds = thresholdSeconds - elapsedSeconds;

  if (remainingSeconds <= 0) {
    return {
      action: 'trigger',
      cycleStartedAt
    };
  }

  return {
    action: 'emit',
    status: 'counting',
    remainingSeconds,
    cycleStartedAt
  };
}
