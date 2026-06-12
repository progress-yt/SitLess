import { app } from 'electron';
import { join } from 'node:path';
import { DEFAULT_REST_PROMPT_OPTIONS, createDefaultSettings } from '../shared/defaults';
import type { AppSettings } from '../shared/types';
import { clampNumber } from '../shared/schedule';
import { readJsonFile, writeJsonFile } from './jsonStore';

export class SettingsStore {
  private readonly filePath: string;
  private settings: AppSettings;

  constructor() {
    this.filePath = join(app.getPath('userData'), 'settings.json');
    this.settings = normalizeSettings(readJsonFile(this.filePath, createDefaultSettings()));
    this.persist();
  }

  get(): AppSettings {
    return cloneSettings(this.settings);
  }

  update(next: AppSettings): AppSettings {
    this.settings = normalizeSettings({
      ...next,
      updatedAtIso: new Date().toISOString()
    });
    this.persist();
    return this.get();
  }

  patch(patch: Partial<AppSettings>): AppSettings {
    this.settings = normalizeSettings({
      ...this.settings,
      ...patch,
      workSchedule: {
        ...this.settings.workSchedule,
        ...patch.workSchedule,
        lunch: {
          ...this.settings.workSchedule.lunch,
          ...patch.workSchedule?.lunch
        }
      },
      updatedAtIso: new Date().toISOString()
    });
    this.persist();
    return this.get();
  }

  private persist(): void {
    writeJsonFile(this.filePath, this.settings);
  }
}

function normalizeSettings(value: unknown): AppSettings {
  const defaults = createDefaultSettings();
  const object = isRecord(value) ? value : {};
  const workSchedule = isRecord(object.workSchedule) ? object.workSchedule : {};
  const lunch = isRecord(workSchedule.lunch) ? workSchedule.lunch : {};
  const merged: AppSettings = {
    ...defaults,
    ...object,
    workSchedule: {
      ...defaults.workSchedule,
      ...workSchedule,
      lunch: {
        ...defaults.workSchedule.lunch,
        ...lunch
      }
    }
  };

  return {
    ...merged,
    mode: merged.mode === 'fixed' ? 'fixed' : 'active',
    workSchedule: {
      start: normalizeTimeString(merged.workSchedule.start, defaults.workSchedule.start),
      end: normalizeTimeString(merged.workSchedule.end, defaults.workSchedule.end),
      lunch: {
        enabled: Boolean(merged.workSchedule.lunch.enabled),
        start: normalizeTimeString(merged.workSchedule.lunch.start, defaults.workSchedule.lunch.start),
        end: normalizeTimeString(merged.workSchedule.lunch.end, defaults.workSchedule.lunch.end)
      }
    },
    activeThresholdMinutes: clampNumber(Number(merged.activeThresholdMinutes), 1, 240),
    fixedIntervalMinutes: clampNumber(Number(merged.fixedIntervalMinutes), 1, 240),
    idleResetMinutes: clampNumber(Number(merged.idleResetMinutes), 1, 60),
    snoozeMinutes: clampNumber(Number(merged.snoozeMinutes), 1, 240),
    countdownSeconds: clampNumber(Number(merged.countdownSeconds), 3, 120),
    soundEnabled: Boolean(merged.soundEnabled),
    launchAtStartup: Boolean(merged.launchAtStartup),
    hasSeenStartupPrompt: Boolean(merged.hasSeenStartupPrompt),
    customReminderImagePath: typeof merged.customReminderImagePath === 'string' && merged.customReminderImagePath ? merged.customReminderImagePath : null,
    restPromptText: normalizeRestPromptText(merged.restPromptText)
  };
}

function cloneSettings(settings: AppSettings): AppSettings {
  return {
    ...settings,
    workSchedule: {
      ...settings.workSchedule,
      lunch: { ...settings.workSchedule.lunch }
    }
  };
}

function normalizeRestPromptText(value: unknown): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) {
    return DEFAULT_REST_PROMPT_OPTIONS[0];
  }

  return normalized.slice(0, 36);
}

function normalizeTimeString(value: unknown, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback;
  }

  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) {
    return fallback;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return fallback;
  }

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
