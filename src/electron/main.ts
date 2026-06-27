import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  net,
  Notification,
  powerMonitor,
  protocol,
  screen,
  shell,
  Tray
} from 'electron';
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SettingsStore } from './settingsStore';
import { StatsStore } from './statsStore';
import { DaySessionStore } from './daySessionStore';
import { RuntimeStateStore } from './runtimeStateStore';
import { PoemStore } from './poemStore';
import { ReminderController } from './reminderController';
import { FALLBACK_TRAY_ICON_DATA_URL } from './trayIconData';
import { BUILT_IN_REMINDER_IMAGES, DEFAULT_BUILT_IN_REMINDER_IMAGE_ID } from '../shared/defaults';
import type { AppSettings, AppSnapshot, BuiltInReminderImageId, CountdownAction, DailyRecordCorrection } from '../shared/types';

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'sitless',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true
    }
  }
]);

let mainWindow: BrowserWindow | null = null;
let countdownWindow: BrowserWindow | null = null;
let fullscreenWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let settingsStore: SettingsStore;
let statsStore: StatsStore;
let daySessionStore: DaySessionStore;
let runtimeStateStore: RuntimeStateStore;
let poemStore: PoemStore;
let controller: ReminderController;
let isQuitting = false;
let pendingRelaunchPrompt = false;

if (process.env.SITLESS_USER_DATA_DIR) {
  app.setPath('userData', process.env.SITLESS_USER_DATA_DIR);
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

app.setName('SitLess');
Menu.setApplicationMenu(null);

app.on('second-instance', () => {
  promptRelaunchExistingInstance();
});

app.whenReady().then(async () => {
  settingsStore = new SettingsStore();
  statsStore = new StatsStore();
  daySessionStore = new DaySessionStore();
  runtimeStateStore = new RuntimeStateStore();
  poemStore = new PoemStore();

  controller = new ReminderController(settingsStore, statsStore, daySessionStore, runtimeStateStore, poemStore, {
    getIdleSeconds: () => powerMonitor.getSystemIdleTime(),
    showNotification,
    confirmWorkdayStart,
    openCountdown: showCountdownWindow,
    closeCountdown: closeCountdownWindow,
    openFullscreen: showFullscreenWindow,
    closeFullscreen: closeFullscreenWindow
  });

  protocol.handle('sitless', () => net.fetch(pathToFileURL(getCurrentReminderImagePath()).toString()));

  applyStartupSetting(settingsStore.get());
  createMainWindow();
  createTray();
  controller.on('snapshot', (snapshot: AppSnapshot) => {
    broadcastSnapshot(snapshot);
    updateTray(snapshot);
  });
  controller.start();
  maybeAskStartupPreference();

  if (pendingRelaunchPrompt) {
    pendingRelaunchPrompt = false;
    void promptRelaunchExistingInstance();
  }
});

app.on('activate', () => {
  showMainWindow();
});

app.on('before-quit', () => {
  isQuitting = true;
  controller?.stop();
});

app.on('window-all-closed', () => undefined);

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1040,
    height: 720,
    minWidth: 880,
    minHeight: 620,
    title: 'SitLess',
    backgroundColor: '#f5f4ef',
    show: false,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  loadRenderer(mainWindow, 'main');
}

function showMainWindow(): void {
  if (!mainWindow) {
    createMainWindow();
    return;
  }

  mainWindow.show();
  mainWindow.focus();
}

async function promptRelaunchExistingInstance(): Promise<void> {
  if (!app.isReady()) {
    pendingRelaunchPrompt = true;
    return;
  }

  showMainWindow();

  const result = await showMessageBox({
    type: 'question',
    title: 'SitLess 已在运行',
    message: 'SitLess 已经启动。是否关闭当前实例并重新启动？',
    buttons: ['重新启动', '继续使用当前实例'],
    defaultId: 0,
    cancelId: 1,
    noLink: true
  });

  if (result.response !== 0) {
    return;
  }

  isQuitting = true;
  app.relaunch();
  app.exit(0);
}

function showCountdownWindow(): void {
  closeCountdownWindow();

  countdownWindow = new BrowserWindow({
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
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  countdownWindow.setAlwaysOnTop(true, 'screen-saver');
  countdownWindow.center();
  loadRenderer(countdownWindow, 'countdown');

  if (settingsStore.get().soundEnabled) {
    shell.beep();
  }
}

function closeCountdownWindow(): void {
  if (countdownWindow && !countdownWindow.isDestroyed()) {
    countdownWindow.close();
  }
  countdownWindow = null;
}

function showFullscreenWindow(): void {
  closeFullscreenWindow();

  const primaryDisplay = screen.getPrimaryDisplay();
  fullscreenWindow = new BrowserWindow({
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
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  fullscreenWindow.setAlwaysOnTop(true, 'screen-saver');
  loadRenderer(fullscreenWindow, 'fullscreen');
}

function closeFullscreenWindow(): void {
  if (fullscreenWindow && !fullscreenWindow.isDestroyed()) {
    fullscreenWindow.close();
  }
  fullscreenWindow = null;
}

function loadRenderer(window: BrowserWindow, view: 'main' | 'countdown' | 'fullscreen'): void {
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;

  if (devServerUrl) {
    window.loadURL(`${devServerUrl}?view=${view}`);
    return;
  }

  window.loadFile(join(__dirname, '../../dist/index.html'), {
    query: { view }
  });
}

function createTray(): void {
  tray = new Tray(getTrayIcon());
  tray.setToolTip('SitLess');
  updateTray(controller.getSnapshot());
}

function updateTray(snapshot: AppSnapshot): void {
  if (!tray) {
    return;
  }

  const pauseLabel = snapshot.status === 'paused' && snapshot.pauseUntilIso
    ? `继续提醒（原暂停到 ${formatTime(new Date(snapshot.pauseUntilIso))}）`
    : '暂停 1 小时';
  const todayLabel = snapshot.mutedToday ? '今日已停止提醒' : '今日不再提醒';

  tray.setToolTip(`SitLess - ${getStatusLabel(snapshot)}`);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '打开主界面', click: showMainWindow },
      { type: 'separator' },
      { label: snapshot.daySession.status === 'off-work' ? '继续提醒' : '我已上班', enabled: snapshot.daySession.status !== 'working', click: () => controller.startWorkday() },
      { label: '我已下班', enabled: snapshot.daySession.status === 'working', click: () => controller.endWorkday() },
      { type: 'separator' },
      { label: pauseLabel, click: () => snapshot.status === 'paused' ? controller.resumeReminders() : controller.pauseForHour() },
      { label: todayLabel, enabled: !snapshot.mutedToday, click: () => controller.muteToday() },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ])
  );
}

function getTrayIcon(): Electron.NativeImage {
  const iconPath = join(app.getAppPath(), 'assets', 'tray.png');
  if (existsSync(iconPath)) {
    return nativeImage.createFromPath(iconPath);
  }

  return nativeImage.createFromDataURL(FALLBACK_TRAY_ICON_DATA_URL);
}

function showNotification(): void {
  const settings = settingsStore.get();

  if (!Notification.isSupported()) {
    return;
  }

  new Notification({
    title: '该起身了',
    body: settings.restPromptText,
    silent: !settings.soundEnabled
  }).show();
}

async function confirmWorkdayStart(): Promise<boolean> {
  if (Notification.isSupported()) {
    new Notification({
      title: '今天上班吗？',
      body: '确认后开始今天的久坐提醒。',
      silent: !settingsStore.get().soundEnabled
    }).show();
  }

  showMainWindow();
  const result = await showMessageBox({
    type: 'question',
    title: '上班确认',
    message: '现在是否已经开始上班？',
    detail: '确认后 SitLess 会开始今天的提醒；取消后今天不会重复弹出这个确认。',
    buttons: ['我已上班', '今天先不提醒'],
    defaultId: 0,
    cancelId: 1,
    noLink: true
  });

  return result.response === 0;
}

function showMessageBox(options: Electron.MessageBoxOptions): Promise<Electron.MessageBoxReturnValue> {
  return mainWindow ? dialog.showMessageBox(mainWindow, options) : dialog.showMessageBox(options);
}

async function maybeAskStartupPreference(): Promise<void> {
  const settings = settingsStore.get();
  if (process.env.SITLESS_SKIP_STARTUP_PROMPT === '1') {
    settingsStore.patch({ hasSeenStartupPrompt: true });
    return;
  }

  if (settings.hasSeenStartupPrompt || !mainWindow) {
    return;
  }

  const result = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    title: '开机自启',
    message: '是否开机后自动启动 SitLess？',
    buttons: ['开启', '暂不开启'],
    defaultId: 0,
    cancelId: 1,
    noLink: true
  });

  const next = settingsStore.patch({
    hasSeenStartupPrompt: true,
    launchAtStartup: result.response === 0
  });
  applyStartupSetting(next);
  controller.refresh();
}

function applyStartupSetting(settings: AppSettings): void {
  app.setLoginItemSettings({
    openAtLogin: settings.launchAtStartup
  });
}

function getCurrentReminderImagePath(): string {
  const settings = settingsStore.get();
  if (settings.customReminderImagePath && existsSync(settings.customReminderImagePath)) {
    return settings.customReminderImagePath;
  }

  return join(app.getAppPath(), 'assets', getBuiltInReminderImage(settings.builtInReminderImageId).assetFilename);
}

function getBuiltInReminderImage(imageId: BuiltInReminderImageId) {
  return BUILT_IN_REMINDER_IMAGES.find((image) => image.id === imageId) ?? BUILT_IN_REMINDER_IMAGES[0];
}

ipcMain.handle('snapshot:get', () => controller.getSnapshot());

ipcMain.handle('settings:update', (_event, settings: AppSettings) => {
  const previous = settingsStore.get();
  const next = settingsStore.update(settings);
  applyStartupSetting(next);
  controller.handleSettingsChange(previous, next);
  if (didReminderImageChange(previous, next)) {
    controller.bumpImageRevision();
  }
  return next;
});

ipcMain.handle('image:select', async () => {
  const options: Electron.OpenDialogOptions = {
    title: '选择提醒图片',
    properties: ['openFile'],
    filters: [
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'] }
    ]
  };
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options);

  if (result.canceled || result.filePaths.length === 0) {
    return { cancelled: true, settings: settingsStore.get() };
  }

  const source = result.filePaths[0];
  const extension = extname(source) || '.png';
  const targetDirectory = join(app.getPath('userData'), 'images');
  mkdirSync(targetDirectory, { recursive: true });
  const target = join(targetDirectory, `reminder${extension}`);
  copyFileSync(source, target);

  const next = settingsStore.patch({ customReminderImagePath: target });
  controller.bumpImageRevision();
  return { cancelled: false, settings: next };
});

ipcMain.handle('image:reset', () => {
  const settings = settingsStore.get();
  if (settings.customReminderImagePath && existsSync(settings.customReminderImagePath)) {
    rmSync(settings.customReminderImagePath, { force: true });
  }

  const next = settingsStore.patch({
    customReminderImagePath: null,
    builtInReminderImageId: DEFAULT_BUILT_IN_REMINDER_IMAGE_ID
  });
  controller.bumpImageRevision();
  return next;
});

ipcMain.handle('image:set-built-in', (_event, imageId: BuiltInReminderImageId) => {
  const settings = settingsStore.get();
  if (settings.customReminderImagePath && existsSync(settings.customReminderImagePath)) {
    rmSync(settings.customReminderImagePath, { force: true });
  }

  const next = settingsStore.patch({
    customReminderImagePath: null,
    builtInReminderImageId: getBuiltInReminderImage(imageId).id
  });
  controller.bumpImageRevision();
  return next;
});

ipcMain.handle('reminder:test', () => controller.testReminderFlow());
ipcMain.handle('reminder:pause-hour', () => controller.pauseForHour());
ipcMain.handle('reminder:resume', () => controller.resumeReminders());
ipcMain.handle('reminder:mute-today', () => controller.muteToday());
ipcMain.handle('poem:refresh', () => controller.refreshDailyPoem());
ipcMain.handle('workday:start', () => controller.startWorkday());
ipcMain.handle('workday:end', () => controller.endWorkday());
ipcMain.handle('records:update', (_event, correction: DailyRecordCorrection) => controller.updateDailyRecord(correction));

ipcMain.on('countdown:action', (_event, action: CountdownAction) => {
  controller.handleCountdownAction(action);
});

ipcMain.on('fullscreen:complete-rest', () => {
  controller.completeRest();
});

function broadcastSnapshot(snapshot: AppSnapshot): void {
  BrowserWindow.getAllWindows().forEach((window) => {
    if (!window.isDestroyed()) {
      window.webContents.send('snapshot:update', snapshot);
    }
  });
}

function didReminderImageChange(previous: AppSettings, next: AppSettings): boolean {
  return (
    previous.builtInReminderImageId !== next.builtInReminderImageId ||
    previous.customReminderImagePath !== next.customReminderImagePath
  );
}

function getStatusLabel(snapshot: AppSnapshot): string {
  switch (snapshot.status) {
    case 'counting':
      return snapshot.remainingSeconds === null ? '计时中' : `下次提醒 ${formatDuration(snapshot.remainingSeconds)}`;
    case 'idle-reset':
      return '等待键鼠活动';
    case 'lunch-break':
      return '午休不提醒';
    case 'awaiting-work-start':
      return '等待上班确认';
    case 'paused':
      return '已暂停';
    case 'snoozed':
      return '稍后提醒';
    case 'muted-today':
      return '今日不再提醒';
    case 'off-work':
      return '已下班';
    case 'countdown':
      return '等待处理';
    case 'fullscreen':
      return '休息中';
    default:
      return '不在提醒时段';
  }
}

function formatDuration(seconds: number): string {
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} 分钟`;
}

function formatTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
