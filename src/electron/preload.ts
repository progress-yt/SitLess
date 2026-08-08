import { contextBridge, ipcRenderer } from 'electron';
import type {
  IpcEventArgs,
  IpcInvokeArgs,
  IpcInvokeChannel,
  IpcInvokeResult,
  IpcSendArgs,
  IpcSendChannel,
  SitlessApi
} from '../shared/ipc';

type IpcChannels = typeof import('../shared/ipc').IPC_CHANNELS;

// Sandboxed preloads cannot require local modules, so keep runtime channel values self-contained.
const IPC_CHANNELS = {
  snapshotGet: 'snapshot:get',
  settingsUpdate: 'settings:update',
  imageSelect: 'image:select',
  imageReset: 'image:reset',
  imageSetBuiltIn: 'image:set-built-in',
  reminderTest: 'reminder:test',
  reminderPauseHour: 'reminder:pause-hour',
  reminderFocus: 'reminder:focus',
  reminderResume: 'reminder:resume',
  reminderMuteToday: 'reminder:mute-today',
  poemRefresh: 'poem:refresh',
  workdayStart: 'workday:start',
  workdayEnd: 'workday:end',
  recordsUpdate: 'records:update',
  dataExportJson: 'data:export-json',
  dataImportJson: 'data:import-json',
  dataExportCsv: 'data:export-csv',
  diagnosticsExport: 'diagnostics:export',
  updateGetState: 'update:get-state',
  updateCheck: 'update:check',
  updateInstall: 'update:install',
  countdownAction: 'countdown:action',
  fullscreenStartRest: 'fullscreen:start-rest',
  fullscreenCompleteRest: 'fullscreen:complete-rest',
  fullscreenInterruptRest: 'fullscreen:interrupt-rest',
  snapshotUpdate: 'snapshot:update'
} as const satisfies IpcChannels;

const api = {
  getSnapshot: () => invokeIpc(IPC_CHANNELS.snapshotGet),
  updateSettings: (...args) => invokeIpc(IPC_CHANNELS.settingsUpdate, ...args),
  selectReminderImage: () => invokeIpc(IPC_CHANNELS.imageSelect),
  resetReminderImage: () => invokeIpc(IPC_CHANNELS.imageReset),
  setBuiltInReminderImage: (...args) => invokeIpc(IPC_CHANNELS.imageSetBuiltIn, ...args),
  testReminderFlow: () => invokeIpc(IPC_CHANNELS.reminderTest),
  pauseForHour: () => invokeIpc(IPC_CHANNELS.reminderPauseHour),
  focusForMinutes: (...args) => invokeIpc(IPC_CHANNELS.reminderFocus, ...args),
  resumeReminders: () => invokeIpc(IPC_CHANNELS.reminderResume),
  muteToday: () => invokeIpc(IPC_CHANNELS.reminderMuteToday),
  refreshDailyPoem: () => invokeIpc(IPC_CHANNELS.poemRefresh),
  startWorkday: () => invokeIpc(IPC_CHANNELS.workdayStart),
  endWorkday: () => invokeIpc(IPC_CHANNELS.workdayEnd),
  updateDailyRecord: (...args) => invokeIpc(IPC_CHANNELS.recordsUpdate, ...args),
  exportDataJson: () => invokeIpc(IPC_CHANNELS.dataExportJson),
  importDataJson: () => invokeIpc(IPC_CHANNELS.dataImportJson),
  exportStatsCsv: () => invokeIpc(IPC_CHANNELS.dataExportCsv),
  exportDiagnostics: () => invokeIpc(IPC_CHANNELS.diagnosticsExport),
  getUpdateState: () => invokeIpc(IPC_CHANNELS.updateGetState),
  checkForUpdates: () => invokeIpc(IPC_CHANNELS.updateCheck),
  installUpdate: () => invokeIpc(IPC_CHANNELS.updateInstall),
  countdownAction: (...args) => sendIpc(IPC_CHANNELS.countdownAction, ...args),
  startRest: () => sendIpc(IPC_CHANNELS.fullscreenStartRest),
  completeRest: () => sendIpc(IPC_CHANNELS.fullscreenCompleteRest),
  interruptRest: () => sendIpc(IPC_CHANNELS.fullscreenInterruptRest),
  onSnapshot: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => {
      callback(...args as IpcEventArgs<typeof IPC_CHANNELS.snapshotUpdate>);
    };
    ipcRenderer.on(IPC_CHANNELS.snapshotUpdate, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.snapshotUpdate, listener);
  }
} satisfies SitlessApi;

function invokeIpc<Channel extends IpcInvokeChannel>(
  channel: Channel,
  ...args: IpcInvokeArgs<Channel>
): Promise<IpcInvokeResult<Channel>> {
  return ipcRenderer.invoke(channel, ...args) as Promise<IpcInvokeResult<Channel>>;
}

function sendIpc<Channel extends IpcSendChannel>(channel: Channel, ...args: IpcSendArgs<Channel>): void {
  ipcRenderer.send(channel, ...args);
}

contextBridge.exposeInMainWorld('sitless', api);

export type { SitlessApi } from '../shared/ipc';
