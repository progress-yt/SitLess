import { Notification } from 'electron';
import type { AppSettings } from '../shared/types';
import type { ReminderWindows } from './reminderWindows';

interface PromptSettingsStore {
  get: () => AppSettings;
}

export type WorkdayStartChoice = 'start' | 'later' | 'mute-today';

export class DesktopPrompts {
  constructor(
    private readonly settingsStore: PromptSettingsStore,
    private readonly windows: ReminderWindows
  ) {}

  showReminder = (): void => {
    const settings = this.settingsStore.get();
    if (!Notification.isSupported()) {
      return;
    }

    new Notification({
      title: '该起身了',
      body: settings.restPromptText,
      silent: !settings.soundEnabled
    }).show();
  };

  confirmWorkdayStart = async (): Promise<WorkdayStartChoice> => {
    if (Notification.isSupported()) {
      new Notification({
        title: '今天上班吗？',
        body: '确认后开始今天的久坐提醒。',
        silent: !this.settingsStore.get().soundEnabled
      }).show();
    }

    this.windows.showMain();
    const result = await this.windows.showMessageBox({
      type: 'question',
      title: '上班确认',
      message: '现在是否已经开始上班？',
      detail: '可以稍后再问，也可以关闭今天的提醒。',
      buttons: ['我已上班', '稍后再问', '今天不提醒'],
      defaultId: 0,
      cancelId: 1,
      noLink: true
    });

    if (result.response === 0) {
      return 'start';
    }
    return result.response === 2 ? 'mute-today' : 'later';
  };

  confirmRelaunch = async (): Promise<boolean> => {
    this.windows.showMain();
    const result = await this.windows.showMessageBox({
      type: 'question',
      title: 'SitLess 已在运行',
      message: 'SitLess 已经启动。是否关闭当前实例并重新启动？',
      buttons: ['重新启动', '继续使用当前实例'],
      defaultId: 0,
      cancelId: 1,
      noLink: true
    });
    return result.response === 0;
  };
}
