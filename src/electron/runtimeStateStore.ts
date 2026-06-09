import { app } from 'electron';
import { join } from 'node:path';
import { createEmptyRuntimeState } from '../shared/defaults';
import { getDateKey } from '../shared/schedule';
import type { ReminderRuntimeState } from '../shared/types';
import { readJsonFile, writeJsonFile } from './jsonStore';

export class RuntimeStateStore {
  private readonly filePath: string;
  private state: ReminderRuntimeState;

  constructor() {
    this.filePath = join(app.getPath('userData'), 'runtime-state.json');
    this.state = normalizeRuntimeState(readJsonFile(this.filePath, createEmptyRuntimeState()));
    this.persist();
  }

  get(date = new Date()): ReminderRuntimeState {
    const todayKey = getDateKey(date);
    const pauseUntilIso = getActivePauseUntilIso(this.state.pauseUntilIso, date);
    if (this.state.pauseUntilIso && !pauseUntilIso) {
      this.state = {
        ...this.state,
        pauseUntilIso: null
      };
      this.persist();
    }

    if (this.state.mutedDateKey && this.state.mutedDateKey !== todayKey) {
      this.state = {
        ...this.state,
        mutedDateKey: null
      };
      this.persist();
    }

    return {
      pauseUntilIso,
      mutedDateKey: this.state.mutedDateKey === todayKey ? this.state.mutedDateKey : null
    };
  }

  setPauseUntil(date: Date | null): ReminderRuntimeState {
    this.state = normalizeRuntimeState({
      ...this.state,
      pauseUntilIso: date?.toISOString() ?? null
    });
    this.persist();
    return this.get();
  }

  muteToday(date = new Date()): ReminderRuntimeState {
    this.state = normalizeRuntimeState({
      ...this.state,
      mutedDateKey: getDateKey(date)
    });
    this.persist();
    return this.get(date);
  }

  clearMute(): ReminderRuntimeState {
    this.state = normalizeRuntimeState({
      ...this.state,
      mutedDateKey: null
    });
    this.persist();
    return this.get();
  }

  private persist(): void {
    writeJsonFile(this.filePath, this.state);
  }
}

function normalizeRuntimeState(value: Partial<ReminderRuntimeState>): ReminderRuntimeState {
  return {
    pauseUntilIso: typeof value.pauseUntilIso === 'string' ? value.pauseUntilIso : null,
    mutedDateKey: typeof value.mutedDateKey === 'string' ? value.mutedDateKey : null
  };
}

function getActivePauseUntilIso(value: string | null, date: Date): string | null {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp > date.getTime() ? value : null;
}
