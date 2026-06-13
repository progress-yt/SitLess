import { app } from 'electron';
import { join } from 'node:path';
import { createEmptyDaySession } from '../shared/defaults';
import { getDateKey, getRecentDateKeys } from '../shared/schedule';
import type { DaySession } from '../shared/types';
import { readJsonFile, writeJsonFile } from './jsonStore';

type DaySessionFile = Record<string, DaySession>;

export class DaySessionStore {
  private readonly filePath: string;
  private sessions: DaySessionFile;

  constructor() {
    this.filePath = join(app.getPath('userData'), 'day-sessions.json');
    this.sessions = readJsonFile(this.filePath, {});
    this.pruneOldEntries();
  }

  private pruneOldEntries(): void {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const cutoffKey = getDateKey(cutoff);
    const keys = Object.keys(this.sessions);
    const toRemove = keys.filter((key) => key < cutoffKey);
    if (toRemove.length === 0) {
      return;
    }

    for (const key of toRemove) {
      delete this.sessions[key];
    }
    this.persist();
  }

  getToday(date = new Date()): DaySession {
    const key = getDateKey(date);
    return normalizeDaySession(this.sessions[key]);
  }

  getRecentDays(limit = 30, date = new Date()): DaySessionFile {
    const keys = getRecentDateKeys(limit, date);
    return keys.reduce<DaySessionFile>((records, key) => {
      records[key] = normalizeDaySession(this.sessions[key]);
      return records;
    }, {});
  }

  start(date = new Date()): DaySession {
    const key = getDateKey(date);
    const current = this.getToday(date);
    const next: DaySession = {
      status: 'working',
      startedAtIso: current.startedAtIso ?? date.toISOString(),
      endedAtIso: null,
      startPromptedAtIso: current.startPromptedAtIso
    };

    this.sessions[key] = next;
    this.persist();
    return this.getToday(date);
  }

  end(date = new Date()): DaySession {
    const key = getDateKey(date);
    const current = this.getToday(date);
    const next: DaySession = {
      status: 'off-work',
      startedAtIso: current.startedAtIso,
      endedAtIso: date.toISOString(),
      startPromptedAtIso: current.startPromptedAtIso
    };

    this.sessions[key] = next;
    this.persist();
    return this.getToday(date);
  }

  markStartPrompted(date = new Date()): DaySession {
    const key = getDateKey(date);
    this.sessions[key] = {
      ...this.getToday(date),
      startPromptedAtIso: date.toISOString()
    };
    this.persist();
    return this.getToday(date);
  }

  setDay(dateKey: string, session: DaySession): DaySession {
    const next = normalizeDaySession(session);
    this.sessions[dateKey] = next;
    this.persist();
    return this.getByDateKey(dateKey);
  }

  private persist(): void {
    writeJsonFile(this.filePath, this.sessions);
  }

  private getByDateKey(dateKey: string): DaySession {
    return normalizeDaySession(this.sessions[dateKey]);
  }
}

function normalizeDaySession(value: unknown): DaySession {
  const empty = createEmptyDaySession();
  const object = isRecord(value) ? value : {};
  return {
    ...empty,
    ...object,
    status: object.status === 'working' || object.status === 'off-work' ? object.status : 'not-started',
    startedAtIso: typeof object.startedAtIso === 'string' ? object.startedAtIso : null,
    endedAtIso: typeof object.endedAtIso === 'string' ? object.endedAtIso : null,
    startPromptedAtIso: typeof object.startPromptedAtIso === 'string' ? object.startPromptedAtIso : null
  };
}


function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
