import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultSettings } from '../shared/defaults';
import type { AppSettings } from '../shared/types';
import { ReminderImages } from './reminderImages';
import type { ReminderWindows } from './reminderWindows';

const electronMock = vi.hoisted(() => ({
  userDataPath: '',
  appPath: ''
}));

vi.mock('electron', () => ({
  app: {
    getPath: () => electronMock.userDataPath,
    getAppPath: () => electronMock.appPath
  },
  net: {
    fetch: vi.fn()
  },
  protocol: {
    handle: vi.fn(),
    registerSchemesAsPrivileged: vi.fn()
  }
}));

describe('ReminderImages managed file cleanup', () => {
  let rootPath: string;

  beforeEach(() => {
    rootPath = mkdtempSync(join(tmpdir(), 'sitless-images-'));
    electronMock.userDataPath = join(rootPath, 'user-data');
    electronMock.appPath = rootPath;
    mkdirSync(electronMock.userDataPath, { recursive: true });
  });

  afterEach(() => {
    rmSync(rootPath, { recursive: true, force: true });
  });

  it('does not delete a path outside the managed images directory', () => {
    const externalPath = join(rootPath, 'keep-me.png');
    writeFileSync(externalPath, 'external', 'utf8');
    const harness = createImageHarness(externalPath);

    harness.images.reset();

    expect(existsSync(externalPath)).toBe(true);
    expect(harness.settings.customReminderImagePath).toBeNull();
  });

  it('still deletes files copied into the managed images directory', () => {
    const managedDirectory = join(electronMock.userDataPath, 'images');
    mkdirSync(managedDirectory, { recursive: true });
    const managedPath = join(managedDirectory, 'reminder.png');
    writeFileSync(managedPath, 'managed', 'utf8');
    const harness = createImageHarness(managedPath);

    harness.images.reset();

    expect(existsSync(managedPath)).toBe(false);
  });
});

function createImageHarness(customReminderImagePath: string) {
  let settings: AppSettings = {
    ...createDefaultSettings(),
    customReminderImagePath
  };
  const settingsStore = {
    get: () => settings,
    patch: (patch: Partial<AppSettings>) => {
      settings = { ...settings, ...patch };
      return settings;
    }
  };
  const windows = {
    showOpenDialog: vi.fn()
  } as unknown as ReminderWindows;

  return {
    images: new ReminderImages(settingsStore, windows),
    get settings() {
      return settings;
    }
  };
}
