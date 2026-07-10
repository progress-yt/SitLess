import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DaySessionStore } from './daySessionStore';
import { StatsStore } from './statsStore';

const electronMock = vi.hoisted(() => ({
  userDataPath: ''
}));

vi.mock('electron', () => ({
  app: {
    getPath: () => electronMock.userDataPath
  }
}));

describe('history stores', () => {
  let userDataPath: string;

  beforeEach(() => {
    userDataPath = mkdtempSync(join(tmpdir(), 'sitless-history-'));
    electronMock.userDataPath = userDataPath;
  });

  afterEach(() => {
    rmSync(userDataPath, { recursive: true, force: true });
  });

  it('keeps statistics older than 90 days', () => {
    const filePath = join(userDataPath, 'stats.json');
    writeFileSync(filePath, JSON.stringify({
      '2020-01-01': {
        reminders: 2,
        completed: 1,
        skipped: 1
      }
    }), 'utf8');

    new StatsStore();

    expect(JSON.parse(readFileSync(filePath, 'utf8'))['2020-01-01']).toBeDefined();
  });

  it('keeps workday sessions older than 90 days', () => {
    const filePath = join(userDataPath, 'day-sessions.json');
    writeFileSync(filePath, JSON.stringify({
      '2020-01-01': {
        status: 'off-work',
        startedAtIso: '2020-01-01T01:00:00.000Z',
        endedAtIso: '2020-01-01T09:00:00.000Z',
        startPromptedAtIso: null
      }
    }), 'utf8');

    new DaySessionStore();

    expect(JSON.parse(readFileSync(filePath, 'utf8'))['2020-01-01']).toBeDefined();
  });
});
