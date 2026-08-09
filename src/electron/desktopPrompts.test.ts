import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultSettings } from '../shared/defaults';
import type { AppSettings } from '../shared/types';
import { DesktopPrompts } from './desktopPrompts';
import type { ReminderWindows } from './reminderWindows';

const electronMock = vi.hoisted(() => {
  const notifications: Array<{ options: Electron.NotificationConstructorOptions; show: ReturnType<typeof vi.fn> }> = [];
  class NotificationMock {
    static isSupported = vi.fn(() => true);
    readonly show = vi.fn();

    constructor(readonly options: Electron.NotificationConstructorOptions) {
      notifications.push({ options, show: this.show });
    }
  }
  return { NotificationMock, notifications };
});

vi.mock('electron', () => ({ Notification: electronMock.NotificationMock }));

describe('DesktopPrompts', () => {
  beforeEach(() => {
    electronMock.notifications.length = 0;
    electronMock.NotificationMock.isSupported.mockReturnValue(true);
  });

  it('uses the configured reminder text and sound preference', () => {
    const settings = { ...createDefaultSettings(), soundEnabled: false, restPromptText: '活动一下' };
    const { prompts } = createHarness(settings);

    prompts.showReminder();

    expect(electronMock.notifications[0].options).toMatchObject({
      title: '该起身了',
      body: '活动一下',
      silent: true
    });
    expect(electronMock.notifications[0].show).toHaveBeenCalledOnce();
  });

  it.each([
    [0, 'start'],
    [1, 'later'],
    [2, 'mute-today']
  ] as const)('maps workday dialog response %s to %s', async (response, expected) => {
    const { prompts, windows } = createHarness(createDefaultSettings(), response);

    await expect(prompts.confirmWorkdayStart()).resolves.toBe(expected);
    expect(windows.showMain).toHaveBeenCalledOnce();
    expect(windows.showMessageBox).toHaveBeenCalledWith(expect.objectContaining({
      buttons: ['我已上班', '稍后再问', '今天不提醒']
    }));
  });
});

function createHarness(settings: AppSettings, response = 0) {
  const windows = {
    showMain: vi.fn(),
    showMessageBox: vi.fn(async () => ({ response, checkboxChecked: false }))
  } as unknown as ReminderWindows;
  return {
    prompts: new DesktopPrompts({ get: () => settings }, windows),
    windows: windows as unknown as {
      showMain: ReturnType<typeof vi.fn>;
      showMessageBox: ReturnType<typeof vi.fn>;
    }
  };
}
