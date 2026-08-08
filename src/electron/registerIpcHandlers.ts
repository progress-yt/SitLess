import { IPC_CHANNELS } from '../shared/ipc';
import type { ReminderController } from './reminderController';
import type { ReminderImages } from './reminderImages';
import type { SettingsStore } from './settingsStore';
import type { StartupPreferences } from './startupPreferences';
import type { LocalDataManager } from './localDataManager';
import type { UpdateManager } from './updateManager';
import type { FocusContextDetector } from './focusContextDetector';
import { handleIpc, listenIpc } from './typedIpc';

interface IpcHandlerDependencies {
  settingsStore: SettingsStore;
  controller: ReminderController;
  images: ReminderImages;
  startupPreferences: StartupPreferences;
  localDataManager: LocalDataManager;
  updateManager: UpdateManager;
  focusContextDetector: FocusContextDetector;
}

export function registerIpcHandlers({
  settingsStore,
  controller,
  images,
  startupPreferences,
  localDataManager,
  updateManager,
  focusContextDetector
}: IpcHandlerDependencies): void {
  handleIpc(IPC_CHANNELS.snapshotGet, () => controller.getSnapshot());
  handleIpc(IPC_CHANNELS.historyGet, () => controller.getHistory());

  handleIpc(IPC_CHANNELS.settingsUpdate, (settings) => {
    const previous = settingsStore.get();
    const next = settingsStore.update(settings);
    if (previous.launchAtStartup !== next.launchAtStartup) {
      startupPreferences.apply(next);
    }
    if (previous.automaticUpdatesEnabled !== next.automaticUpdatesEnabled) {
      updateManager.initialize(next.automaticUpdatesEnabled);
    }
    if (previous.respectFocusContext !== next.respectFocusContext) {
      focusContextDetector.setEnabled(next.respectFocusContext);
    }
    controller.handleSettingsChange(previous, next);
    return next;
  });

  handleIpc(IPC_CHANNELS.imageSelect, async () => {
    const result = await images.select();
    if (!result.cancelled) {
      controller.bumpImageRevision();
    }
    return result;
  });

  handleIpc(IPC_CHANNELS.imageReset, () => {
    const settings = images.reset();
    controller.bumpImageRevision();
    return settings;
  });

  handleIpc(IPC_CHANNELS.imageSetBuiltIn, (imageId) => {
    const settings = images.setBuiltIn(imageId);
    controller.bumpImageRevision();
    return settings;
  });

  handleIpc(IPC_CHANNELS.reminderTest, () => controller.testReminderFlow());
  handleIpc(IPC_CHANNELS.reminderPauseHour, () => controller.pauseForHour());
  handleIpc(IPC_CHANNELS.reminderFocus, (minutes) => controller.focusForMinutes(minutes));
  handleIpc(IPC_CHANNELS.reminderResume, () => controller.resumeReminders());
  handleIpc(IPC_CHANNELS.reminderMuteToday, () => controller.muteToday());
  handleIpc(IPC_CHANNELS.poemRefresh, () => controller.refreshDailyPoem());
  handleIpc(IPC_CHANNELS.workdayStart, () => controller.startWorkday());
  handleIpc(IPC_CHANNELS.workdayEnd, () => controller.endWorkday());
  handleIpc(IPC_CHANNELS.recordsUpdate, (correction) => controller.updateDailyRecord(correction));
  handleIpc(IPC_CHANNELS.dataExportJson, () => localDataManager.exportJson());
  handleIpc(IPC_CHANNELS.dataImportJson, () => localDataManager.importJson());
  handleIpc(IPC_CHANNELS.dataExportCsv, () => localDataManager.exportCsv());
  handleIpc(IPC_CHANNELS.diagnosticsExport, () => localDataManager.exportDiagnostics());
  handleIpc(IPC_CHANNELS.updateGetState, () => updateManager.getState());
  handleIpc(IPC_CHANNELS.updateCheck, () => updateManager.check());
  handleIpc(IPC_CHANNELS.updateInstall, () => updateManager.install());

  listenIpc(IPC_CHANNELS.countdownAction, (action) => controller.handleCountdownAction(action));
  listenIpc(IPC_CHANNELS.fullscreenStartRest, () => controller.startRest());
  listenIpc(IPC_CHANNELS.fullscreenCompleteRest, () => controller.completeRest());
  listenIpc(IPC_CHANNELS.fullscreenInterruptRest, () => controller.interruptRest());
}
