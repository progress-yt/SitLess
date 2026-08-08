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
    return this.updateState({
      ...this.state,
      pauseUntilIso: date?.toISOString() ?? null
    }, currentDate);
  }

  muteToday(date = new Date()): ReminderRuntimeState {
    return this.updateState({
      ...this.state,
      mutedDateKey: getDateKey(date)
    }, date);
  }

  clearMute(date = new Date()): ReminderRuntimeState {
    return this.updateState({
      ...this.state,
      mutedDateKey: null
    }, date);
  }

  setSession(patch: Partial<ReminderRuntimeState>, date = new Date()): ReminderRuntimeState {
    return this.updateState({ ...this.state, ...patch }, date);
  }

  private updateState(value: unknown, date: Date): ReminderRuntimeState {
    const next = normalizeRuntimeState(value);
    if (!runtimeStatesEqual(next, this.state)) {
      this.state = next;
      this.persist();
    }
    return this.get(date);
  }

  private persist(): void {
    writeJsonFile(this.filePath, this.state);
  }
}

function runtimeStatesEqual(left: ReminderRuntimeState, right: ReminderRuntimeState): boolean {
  return Object.keys(left).every((key) => (
    left[key as keyof ReminderRuntimeState] === right[key as keyof ReminderRuntimeState]
  ));
}
