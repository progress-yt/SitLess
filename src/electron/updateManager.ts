import { EventEmitter } from 'node:events';
import { app } from 'electron';
import { autoUpdater } from 'electron-updater';
import type { UpdateState } from '../shared/types';

export class UpdateManager extends EventEmitter {
  private state: UpdateState = {
    status: 'unavailable',
    currentVersion: app.getVersion(),
    availableVersion: null,
    message: null
  };
  private enabled = false;

  constructor() {
    super();
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('checking-for-update', () => this.patchFromUpdater({ status: 'checking', message: null }));
    autoUpdater.on('update-available', (info) => this.patchFromUpdater({ status: 'available', availableVersion: info.version }));
    autoUpdater.on('update-not-available', () => this.patchFromUpdater({ status: 'up-to-date', availableVersion: null }));
    autoUpdater.on('update-downloaded', (info) => this.patchFromUpdater({ status: 'downloaded', availableVersion: info.version }));
    autoUpdater.on('error', (error) => this.patchFromUpdater({ status: 'error', message: error.message }));
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

  private patchFromUpdater(patch: Partial<UpdateState>): void {
    if (this.enabled) {
      this.patch(patch);
    }
  }

  private patch(patch: Partial<UpdateState>): void {
    const next = { ...this.state, ...patch };
    if (JSON.stringify(next) !== JSON.stringify(this.state)) {
      this.state = next;
      this.emit('state', this.getState());
    }
  }
}
