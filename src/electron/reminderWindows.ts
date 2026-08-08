import { app, BrowserWindow, dialog, screen, shell } from 'electron';
import { join } from 'node:path';
import { IPC_CHANNELS } from '../shared/ipc';
import type { RealtimeSnapshot, UpdateState } from '../shared/types';
import type { WebContents } from 'electron';
import { sendIpc } from './typedIpc';
import { getTrustedDevServerUrl } from './rendererSecurity';

type RendererView = 'main' | 'countdown' | 'fullscreen';
type ReminderWindowView = Exclude<RendererView, 'main'>;

export class ReminderWindows {
  private mainWindow: BrowserWindow | null = null;
  private countdownWindow: BrowserWindow | null = null;
  private fullscreenWindow: BrowserWindow | null = null;
  private readonly intentionalClosures = new WeakSet<BrowserWindow>();
  private readonly handledClosures = new WeakSet<BrowserWindow>();

  constructor(
    private readonly isQuitting: () => boolean,
    private readonly isSoundEnabled: () => boolean,
    private readonly onUnexpectedReminderWindowClosed: (view: ReminderWindowView) => void
  ) {}

  createMain(): void {
    this.mainWindow = new BrowserWindow({
      width: 1040,
      height: 720,
      minWidth: 880,
      minHeight: 620,
      title: 'SitLess',
      backgroundColor: '#f5f4ef',
      show: false,
      webPreferences: this.getWebPreferences()
    });

    this.mainWindow.on('close', (event) => {
      if (!this.isQuitting()) {
        event.preventDefault();
        this.mainWindow?.hide();
      }
    });

    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow?.show();
    });

    this.loadRenderer(this.mainWindow, 'main');
  }

  showMain(): void {
    if (!this.mainWindow) {
      this.createMain();
      return;
    }

    this.mainWindow.show();
    this.mainWindow.focus();
  }

  showCountdown(): void {
    this.closeCountdown();
    this.countdownWindow = new BrowserWindow({
      width: 436,
      height: 360,
      resizable: false,
      maximizable: false,
      minimizable: false,
      frame: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      title: 'SitLess 提醒',
      backgroundColor: '#f7f4ed',
      webPreferences: this.getWebPreferences()
    });

    this.countdownWindow.setAlwaysOnTop(true, 'screen-saver');
    this.countdownWindow.center();
    this.trackReminderWindow(this.countdownWindow, 'countdown');
    this.loadRenderer(this.countdownWindow, 'countdown');

    if (this.isSoundEnabled()) {
      shell.beep();
    }
  }

  closeCountdown(): void {
    const window = this.countdownWindow;
    this.countdownWindow = null;
    if (window && !window.isDestroyed()) {
      this.intentionalClosures.add(window);
      window.close();
    }
  }

  showFullscreen(): void {
    this.closeFullscreen();
    const primaryDisplay = screen.getPrimaryDisplay();
    this.fullscreenWindow = new BrowserWindow({
      x: primaryDisplay.bounds.x,
      y: primaryDisplay.bounds.y,
      width: primaryDisplay.bounds.width,
      height: primaryDisplay.bounds.height,
      frame: false,
      fullscreen: true,
      resizable: false,
      movable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      backgroundColor: '#111111',
      webPreferences: this.getWebPreferences()
    });

    this.fullscreenWindow.setAlwaysOnTop(true, 'screen-saver');
    this.trackReminderWindow(this.fullscreenWindow, 'fullscreen');
    this.loadRenderer(this.fullscreenWindow, 'fullscreen');
  }

  closeFullscreen(): void {
    const window = this.fullscreenWindow;
    this.fullscreenWindow = null;
    if (window && !window.isDestroyed()) {
      this.intentionalClosures.add(window);
      window.close();
    }
  }

  showMessageBox(options: Electron.MessageBoxOptions): Promise<Electron.MessageBoxReturnValue> {
    return this.mainWindow
      ? dialog.showMessageBox(this.mainWindow, options)
      : dialog.showMessageBox(options);
  }

  showOpenDialog(options: Electron.OpenDialogOptions): Promise<Electron.OpenDialogReturnValue> {
    return this.mainWindow
      ? dialog.showOpenDialog(this.mainWindow, options)
      : dialog.showOpenDialog(options);
  }

  broadcast(snapshot: RealtimeSnapshot): void {
    this.broadcastEvent((webContents) => {
      sendIpc(webContents, IPC_CHANNELS.snapshotUpdate, snapshot);
    });
  }

  broadcastUpdateState(state: UpdateState): void {
    this.broadcastEvent((webContents) => {
      sendIpc(webContents, IPC_CHANNELS.updateStateUpdate, state);
    });
  }

  private broadcastEvent(send: (webContents: WebContents) => void): void {
    BrowserWindow.getAllWindows().forEach((window) => {
      if (
        window.isDestroyed() ||
        window.webContents.isDestroyed() ||
        window.webContents.isCrashed() ||
        window.webContents.isLoadingMainFrame()
      ) {
        return;
      }

      try {
        if (window.webContents.mainFrame.detached) {
          return;
        }
        send(window.webContents);
      } catch {
        // A reminder window can disappear between enumeration and IPC delivery.
      }
    });
  }

  private getWebPreferences(): Electron.WebPreferences {
    return {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    };
  }

  showSaveDialog(options: Electron.SaveDialogOptions): Promise<Electron.SaveDialogReturnValue> {
    return this.mainWindow
      ? dialog.showSaveDialog(this.mainWindow, options)
      : dialog.showSaveDialog(options);
  }

  private trackReminderWindow(window: BrowserWindow, view: ReminderWindowView): void {
    const finalize = () => {
      if (this.handledClosures.has(window)) {
        return;
      }
      this.handledClosures.add(window);

      if (view === 'countdown' && this.countdownWindow === window) {
        this.countdownWindow = null;
      }
      if (view === 'fullscreen' && this.fullscreenWindow === window) {
        this.fullscreenWindow = null;
      }

      if (!this.intentionalClosures.has(window) && !this.isQuitting()) {
        this.onUnexpectedReminderWindowClosed(view);
      }
    };

    window.once('closed', finalize);
    window.webContents.once('render-process-gone', () => {
      finalize();
      if (!window.isDestroyed()) {
        window.destroy();
      }
    });
  }

  private loadRenderer(window: BrowserWindow, view: RendererView): void {
    const devServerUrl = getTrustedDevServerUrl(process.env.VITE_DEV_SERVER_URL, app.isPackaged);
    if (devServerUrl) {
      void window.loadURL(`${devServerUrl}?view=${view}`);
      return;
    }

    const rendererPath = join(__dirname, '../../dist/index.html');
    void window.loadFile(rendererPath, {
      query: { view }
    });
  }
}
