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

function normalizeSettings(value: AppSettings): AppSettings {
  const defaults = createDefaultSettings();
  const merged: AppSettings = {
    ...defaults,
    ...value,
    workSchedule: {
      ...defaults.workSchedule,
      ...value.workSchedule,
      lunch: {
        ...defaults.workSchedule.lunch,
        ...value.workSchedule?.lunch
      }
    }
  };

  return {
    ...merged,
    mode: merged.mode === 'fixed' ? 'fixed' : 'active',
    activeThresholdMinutes: clampNumber(merged.activeThresholdMinutes, 1, 240),
    fixedIntervalMinutes: clampNumber(merged.fixedIntervalMinutes, 1, 240),
    idleResetMinutes: clampNumber(merged.idleResetMinutes, 1, 60),
    snoozeMinutes: clampNumber(merged.snoozeMinutes, 1, 240),
    countdownSeconds: clampNumber(merged.countdownSeconds, 3, 120),
    soundEnabled: Boolean(merged.soundEnabled),
    launchAtStartup: Boolean(merged.launchAtStartup),
    hasSeenStartupPrompt: Boolean(merged.hasSeenStartupPrompt),
    customReminderImagePath: merged.customReminderImagePath || null,
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

function normalizeRestPromptText(value: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) {
    return DEFAULT_REST_PROMPT_OPTIONS[0];
  }

  return normalized.slice(0, 36);
}
