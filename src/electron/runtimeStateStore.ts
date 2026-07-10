import { app } from 'electron';
import { join } from 'node:path';
import { createEmptyRuntimeState } from '../shared/defaults';
import { getActiveRuntimeState, normalizeRuntimeState } from '../shared/persistence';
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
    const active = getActiveRuntimeState(this.state, date);
    if (active.pauseUntilIso !== this.state.pauseUntilIso || active.mutedDateKey !== this.state.mutedDateKey) {
      this.state = active;
      this.persist();
    }
    return { ...active };
  }

  setPauseUntil(date: Date | null, currentDate = new Date()): ReminderRuntimeState {
    this.state = normalizeRuntimeState({
      ...this.state,
      pauseUntilIso: date?.toISOString() ?? null
    });
    this.persist();
    return this.get(currentDate);
  }

  muteToday(date = new Date()): ReminderRuntimeState {
    this.state = normalizeRuntimeState({
      ...this.state,
      mutedDateKey: getDateKey(date)
    });
    this.persist();
    return this.get(date);
  }

  clearMute(date = new Date()): ReminderRuntimeState {
    this.state = normalizeRuntimeState({
      ...this.state,
      mutedDateKey: null
    });
    this.persist();
    return this.get(date);
  }

  private persist(): void {
    writeJsonFile(this.filePath, this.state);
  }
}
