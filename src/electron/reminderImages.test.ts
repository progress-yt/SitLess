import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { net, protocol } from 'electron';
import { createDefaultSettings } from '../shared/defaults';
import type { AppSettings } from '../shared/types';
import { ReminderImages, registerReminderImageScheme } from './reminderImages';
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

  it('does not serve a custom image outside the managed images directory', () => {
    const externalPath = join(rootPath, 'private.txt');
    writeFileSync(externalPath, 'private', 'utf8');
    const harness = createImageHarness(externalPath);

    expect(harness.images.getCurrentPath()).toBe(join(rootPath, 'assets', 'default-reminder.svg'));
    expect(harness.images.isFallbackActive()).toBe(true);
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

  it('rejects requests outside the fixed reminder image URL', async () => {
    const harness = createImageHarness(null);
    harness.images.registerProtocolHandler();
    const handler = vi.mocked(protocol.handle).mock.calls.at(-1)?.[1];

    const response = await handler?.({ url: 'sitless://other/path' } as Electron.ProtocolRequest);

    expect(response?.status).toBe(404);
    expect(net.fetch).not.toHaveBeenCalled();
  });

  it('validates a selected image before replacing the managed file', async () => {
    const source = join(rootPath, 'spoofed.png');
    writeFileSync(source, 'not-a-png', 'utf8');
    const harness = createImageHarness(null, source);

    await expect(harness.images.select()).rejects.toThrow('内容与文件格式不匹配');

    expect(harness.settings.customReminderImagePath).toBeNull();
    expect(existsSync(join(electronMock.userDataPath, 'images', 'reminder.png'))).toBe(false);
  });

  it('replaces a previous image only after the new image is ready', async () => {
    const managedDirectory = join(electronMock.userDataPath, 'images');
    mkdirSync(managedDirectory, { recursive: true });
    const previousPath = join(managedDirectory, 'reminder.jpg');
    writeFileSync(previousPath, Buffer.from([0xff, 0xd8, 0xff]));
    const source = join(rootPath, 'next.png');
    const sourceBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    writeFileSync(source, sourceBytes);
    const harness = createImageHarness(previousPath, source);

    const result = await harness.images.select();
    const nextPath = join(managedDirectory, 'reminder.png');

    expect(result.cancelled).toBe(false);
    expect(harness.settings.customReminderImagePath).toBe(nextPath);
    expect(readFileSync(nextPath)).toEqual(sourceBytes);
    expect(existsSync(previousPath)).toBe(false);
  });

  it('keeps the previous image when saving the new setting fails', async () => {
    const managedDirectory = join(electronMock.userDataPath, 'images');
    mkdirSync(managedDirectory, { recursive: true });
    const previousPath = join(managedDirectory, 'reminder.jpg');
    writeFileSync(previousPath, Buffer.from([0xff, 0xd8, 0xff]));
    const source = join(rootPath, 'next.png');
    writeFileSync(source, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const harness = createImageHarness(previousPath, source, true);

    await expect(harness.images.select()).rejects.toThrow('settings write failed');

    expect(existsSync(previousPath)).toBe(true);
    expect(harness.settings.customReminderImagePath).toBe(previousPath);
  });
});

describe('ReminderImages protocol privileges', () => {
  it('does not expose the reminder image scheme to renderer fetch', () => {
    registerReminderImageScheme();

    expect(protocol.registerSchemesAsPrivileged).toHaveBeenCalledWith([
      {
        scheme: 'sitless',
        privileges: {
          standard: true,
          secure: true,
          stream: true
        }
      }
    ]);
  });
});

function createImageHarness(customReminderImagePath: string | null, selectedPath?: string, failPatch = false) {
  let settings: AppSettings = {
    ...createDefaultSettings(),
    customReminderImagePath
  };
  const settingsStore = {
    get: () => settings,
    patch: (patch: Partial<AppSettings>) => {
      if (failPatch) {
        throw new Error('settings write failed');
      }
      settings = { ...settings, ...patch };
      return settings;
    }
  };
  const windows = {
    showOpenDialog: vi.fn(async () => ({
      canceled: !selectedPath,
      filePaths: selectedPath ? [selectedPath] : []
    }))
  } as unknown as ReminderWindows;

  return {
    images: new ReminderImages(settingsStore, windows),
    get settings() {
      return settings;
    }
  };
}
