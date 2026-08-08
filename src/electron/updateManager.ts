import { app } from 'electron';
import { autoUpdater } from 'electron-updater';
import type { UpdateState } from '../shared/types';

export class UpdateManager {
  private state: UpdateState = {
    status: 'unavailable',
    currentVersion: app.getVersion(),
    availableVersion: null,
    message: null
  };
  private enabled = false;

  constructor() {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('checking-for-update', () => this.patch({ status: 'checking', message: null }));
    autoUpdater.on('update-available', (info) => this.patch({ status: 'available', availableVersion: info.version }));
    autoUpdater.on('update-not-available', () => this.patch({ status: 'up-to-date', availableVersion: null }));
    autoUpdater.on('update-downloaded', (info) => this.patch({ status: 'downloaded', availableVersion: info.version }));
    autoUpdater.on('error', (error) => this.patch({ status: 'error', message: error.message }));
  }

  initialize(enabled: boolean): void {
    this.enabled = enabled;
    const updateUrl = process.env.SITLESS_UPDATE_URL?.trim();
    if (!enabled) {
      this.patch({ status: 'disabled', message: null });
      return;
    }
    if (!app.isPackaged) {
      this.patch({
        status: 'unavailable',
        message: '开发模式不检查更新'
      });
      return;
    }
    if (updateUrl) {
      autoUpdater.setFeedURL({ provider: 'generic', url: updateUrl });
    }
    this.patch({ status: 'idle', message: null });
    void this.check();
  }

  getState(): UpdateState {
    return { ...this.state };
  }

  async check(): Promise<UpdateState> {
    if (!this.enabled || this.state.status === 'unavailable' || this.state.status === 'disabled') {
      return this.getState();
    }
    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      this.patch({ status: 'error', message: error instanceof Error ? error.message : '检查更新失败' });
    }
    return this.getState();
  }

  install(): UpdateState {
    if (this.state.status === 'downloaded') {
      autoUpdater.quitAndInstall(false, true);
    }
    return this.getState();
  }

  private patch(patch: Partial<UpdateState>): void {
    this.state = { ...this.state, ...patch };
  }
}
