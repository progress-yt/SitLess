import { app, Menu, powerMonitor } from 'electron';
import type { AppSnapshot, UpdateState } from '../shared/types';
import { toRealtimeSnapshot } from '../shared/snapshot';
import { DaySessionStore } from './daySessionStore';
import { FocusContextDetector } from './focusContextDetector';
import { LocalDataManager } from './localDataManager';
import { DesktopPrompts } from './desktopPrompts';
import { writeDiagnosticLog } from './diagnosticLog';
import { PoemStore } from './poemStore';
import { registerIpcHandlers } from './registerIpcHandlers';
import { ReminderController } from './reminderController';
import { ReminderImages, registerReminderImageScheme } from './reminderImages';
import { ReminderTray } from './reminderTray';
import { ReminderWindows } from './reminderWindows';
import { RuntimeStateStore } from './runtimeStateStore';
import { SettingsStore } from './settingsStore';
import { StartupPreferences } from './startupPreferences';
import { StatsStore } from './statsStore';
import { UpdateManager } from './updateManager';

registerReminderImageScheme();

let settingsStore: SettingsStore | null = null;
let controller: ReminderController | null = null;
let desktopPrompts: DesktopPrompts | null = null;
let isQuitting = false;
let pendingRelaunchPrompt = false;
const focusContextDetector = new FocusContextDetector();

const windows = new ReminderWindows(
  () => isQuitting,
  () => settingsStore?.get().soundEnabled ?? false,
  (view) => controller?.handleReminderWindowClosed(view)
);

if (process.env.SITLESS_USER_DATA_DIR) {
  app.setPath('userData', process.env.SITLESS_USER_DATA_DIR);
}

const gotLock = process.env.SITLESS_SKIP_GLOBAL_INSTANCE_LOCK === '1'
  || app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

app.setName('SitLess');
Menu.setApplicationMenu(null);

app.on('second-instance', () => {
  void promptRelaunchExistingInstance();
});

app.whenReady().then(() => {
  writeDiagnosticLog('app-ready', `version=${app.getVersion()}`);
  settingsStore = new SettingsStore();
  const statsStore = new StatsStore();
  const daySessionStore = new DaySessionStore();
  const runtimeStateStore = new RuntimeStateStore();
  const poemStore = new PoemStore();
  const images = new ReminderImages(settingsStore, windows);
  const localDataManager = new LocalDataManager(windows);
  const updateManager = new UpdateManager();
  desktopPrompts = new DesktopPrompts(settingsStore, windows);

  controller = new ReminderController(
    settingsStore,
    statsStore,
    daySessionStore,
    runtimeStateStore,
    poemStore,
    {
      getIdleSeconds: () => powerMonitor.getSystemIdleTime(),
      showNotification: desktopPrompts.showReminder,
      confirmWorkdayStart: desktopPrompts.confirmWorkdayStart,
      openCountdown: () => windows.showCountdown(),
      closeCountdown: () => windows.closeCountdown(),
      openFullscreen: () => windows.showFullscreen(),
      closeFullscreen: () => windows.closeFullscreen(),
      isImageFallbackActive: images.isFallbackActive,
      getFocusContext: focusContextDetector.getState
    }
  );

  const activeController = controller;
  const startupPreferences = new StartupPreferences(
    settingsStore,
    windows,
    () => activeController.refresh()
  );
  const tray = new ReminderTray({
    showMain: () => windows.showMain(),
    startWorkday: () => activeController.startWorkday(),
    endWorkday: () => activeController.endWorkday(),
    pauseForHour: () => activeController.pauseForHour(),
    focusForMinutes: (minutes) => activeController.focusForMinutes(minutes),
    resumeReminders: () => activeController.resumeReminders(),
    muteToday: () => activeController.muteToday(),
    quit: () => {
      isQuitting = true;
      app.quit();
    }
  });

  images.registerProtocolHandler();
  startupPreferences.apply(settingsStore.get());
  registerIpcHandlers({
    settingsStore,
    controller: activeController,
    images,
    startupPreferences,
    localDataManager,
    updateManager,
    focusContextDetector
  });
  updateManager.initialize(settingsStore.get().automaticUpdatesEnabled);
  windows.createMain();
  tray.create(activeController.getSnapshot());

  activeController.on('snapshot', (snapshot: AppSnapshot) => {
    windows.broadcast(toRealtimeSnapshot(snapshot));
    tray.update(snapshot);
  });
  updateManager.on('state', (state: UpdateState) => windows.broadcastUpdateState(state));
  activeController.start();
  focusContextDetector.setEnabled(settingsStore.get().respectFocusContext);
  void startupPreferences.maybeAsk();

  if (pendingRelaunchPrompt) {
    pendingRelaunchPrompt = false;
    void promptRelaunchExistingInstance();
  }
});

app.on('activate', () => {
  windows.showMain();
});

app.on('before-quit', () => {
  writeDiagnosticLog('app-before-quit');
  isQuitting = true;
  controller?.stop();
  focusContextDetector.stop();
});

app.on('window-all-closed', () => undefined);

async function promptRelaunchExistingInstance(): Promise<void> {
  if (!app.isReady() || !desktopPrompts) {
    pendingRelaunchPrompt = true;
    return;
  }

  if (!await desktopPrompts.confirmRelaunch()) {
    return;
  }

  isQuitting = true;
  app.relaunch();
  app.exit(0);
}
