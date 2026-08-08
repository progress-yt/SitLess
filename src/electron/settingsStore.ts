import { app } from 'electron';
import { join } from 'node:path';
import { createDefaultSettings } from '../shared/defaults';
import { applyEditableSettingsPatch, cloneSettings, normalizeSettings } from '../shared/persistence';
import type { AppSettings, AppSettingsPatch } from '../shared/types';
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

  update(patch: AppSettingsPatch): AppSettings {
    this.settings = applyEditableSettingsPatch(this.settings, patch);
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
      weeklySchedule: {
        ...this.settings.weeklySchedule,
        ...patch.weeklySchedule
      },
      scheduleOverrides: patch.scheduleOverrides ?? this.settings.scheduleOverrides,
      updatedAtIso: new Date().toISOString()
    });
    this.persist();
    return this.get();
  }

  private persist(): void {
    writeJsonFile(this.filePath, this.settings);
  }
}
