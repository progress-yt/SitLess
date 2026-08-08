import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyRuntimeState } from '../shared/defaults';
import { RuntimeStateStore } from './runtimeStateStore';

const mocks = vi.hoisted(() => ({
  writes: [] as unknown[]
}));

vi.mock('electron', () => ({
  app: { getPath: () => 'C:\\sitless-test' }
}));

vi.mock('./jsonStore', () => ({
  readJsonFile: () => createEmptyRuntimeState(),
  writeJsonFile: (_path: string, value: unknown) => mocks.writes.push(value)
}));

describe('runtime state persistence', () => {
  beforeEach(() => {
    mocks.writes.length = 0;
  });

  it('does not write an unchanged reminder session every tick', () => {
    const store = new RuntimeStateStore();
    const patch = { cycleStartedAtIso: '2026-06-10T09:00:00.000Z' };

    store.setSession(patch, new Date('2026-06-10T10:00:00.000Z'));
    store.setSession(patch, new Date('2026-06-10T10:00:01.000Z'));

    expect(mocks.writes).toHaveLength(2);
  });
});
