import { app } from 'electron';
import type { AppSettings } from '../shared/types';
import type { ReminderWindows } from './reminderWindows';

interface StartupSettingsStore {
  get: () => AppSettings;
  patch: (patch: Partial<AppSettings>) => AppSettings;
}

export class StartupPreferences {
  constructor(
    private readonly settingsStore: StartupSettingsStore,
    private readonly windows: ReminderWindows,
    private readonly onChange: () => void
  ) {}

  apply(settings: AppSettings): void {
    app.setLoginItemSettings({
      openAtLogin: settings.launchAtStartup
    });
  }

  async maybeAsk(): Promise<void> {
    const settings = this.settingsStore.get();
    if (process.env.SITLESS_SKIP_STARTUP_PROMPT === '1') {
      this.settingsStore.patch({ hasSeenStartupPrompt: true });
      return;
    }

    if (settings.hasSeenStartupPrompt) {
      return;
    }

    const result = await this.windows.showMessageBox({
      type: 'question',
      title: '开机自启',
      message: '是否开机后自动启动 SitLess？',
      buttons: ['开启', '暂不开启'],
      defaultId: 0,
      cancelId: 1,
      noLink: true
    });

    const next = this.settingsStore.patch({
      hasSeenStartupPrompt: true,
      launchAtStartup: result.response === 0
    });
    this.apply(next);
    this.onChange();
  }
}
