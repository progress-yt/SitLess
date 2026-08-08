import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => void>();
  return {
    app: {
      getVersion: vi.fn(() => '1.2.3'),
      isPackaged: true
    },
    handlers,
    updater: {
      autoDownload: false,
      autoInstallOnAppQuit: false,
      on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        handlers.set(event, handler);
      }),
      setFeedURL: vi.fn(),
      checkForUpdates: vi.fn(async () => undefined),
      quitAndInstall: vi.fn()
    }
  };
});

vi.mock('electron', () => ({ app: mocks.app }));
vi.mock('electron-updater', () => ({ autoUpdater: mocks.updater }));

import { UpdateManager } from './updateManager';

describe('UpdateManager', () => {
  beforeEach(() => {
    mocks.handlers.clear();
    mocks.app.isPackaged = true;
    vi.clearAllMocks();
  });

  it('does not check for updates in development mode or when disabled', async () => {
    mocks.app.isPackaged = false;
    const development = new UpdateManager();
    development.initialize(true);
    await Promise.resolve();
    expect(development.getState().status).toBe('unavailable');
    expect(mocks.updater.checkForUpdates).not.toHaveBeenCalled();

    const disabled = new UpdateManager();
    disabled.initialize(false);
    await disabled.check();
    mocks.handlers.get('update-downloaded')?.({ version: '2.0.0' });
    expect(disabled.getState().status).toBe('disabled');
    expect(mocks.updater.checkForUpdates).not.toHaveBeenCalled();
  });

  it('checks in packaged mode and emits only changed states', async () => {
    const manager = new UpdateManager();
    const states: string[] = [];
    manager.on('state', (state) => states.push(state.status));

    manager.initialize(true);
    await Promise.resolve();
    mocks.handlers.get('checking-for-update')?.();
    mocks.handlers.get('checking-for-update')?.();

    expect(mocks.updater.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(states).toEqual(['idle', 'checking']);
  });

  it('installs only after an update has downloaded', () => {
    const manager = new UpdateManager();
    manager.initialize(true);
    manager.install();
    expect(mocks.updater.quitAndInstall).not.toHaveBeenCalled();

    mocks.handlers.get('update-downloaded')?.({ version: '2.0.0' });
    manager.install();

    expect(mocks.updater.quitAndInstall).toHaveBeenCalledWith(false, true);
  });
});
