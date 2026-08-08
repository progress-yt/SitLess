import type {
  AppSettings,
  AppSettingsPatch,
  AppSnapshot,
  BuiltInReminderImageId,
  CountdownAction,
  DailyPoemRefreshResult,
  DailyRecordCorrection,
  DataOperationResult,
  ImageSelectionResult,
  HistorySnapshot,
  RealtimeSnapshot,
  UpdateState
} from './types';

export const IPC_CHANNELS = {
  snapshotGet: 'snapshot:get',
  historyGet: 'history:get',
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
  snapshotUpdate: 'snapshot:update',
  updateStateUpdate: 'update:state-update'
} as const;

export interface IpcInvokeContract {
  [IPC_CHANNELS.snapshotGet]: { args: []; result: AppSnapshot };
  [IPC_CHANNELS.historyGet]: { args: []; result: HistorySnapshot };
  [IPC_CHANNELS.settingsUpdate]: { args: [patch: AppSettingsPatch]; result: AppSettings };
  [IPC_CHANNELS.imageSelect]: { args: []; result: ImageSelectionResult };
  [IPC_CHANNELS.imageReset]: { args: []; result: AppSettings };
  [IPC_CHANNELS.imageSetBuiltIn]: { args: [imageId: BuiltInReminderImageId]; result: AppSettings };
  [IPC_CHANNELS.reminderTest]: { args: []; result: AppSnapshot };
  [IPC_CHANNELS.reminderPauseHour]: { args: []; result: AppSnapshot };
  [IPC_CHANNELS.reminderFocus]: { args: [minutes: number]; result: AppSnapshot };
  [IPC_CHANNELS.reminderResume]: { args: []; result: AppSnapshot };
  [IPC_CHANNELS.reminderMuteToday]: { args: []; result: AppSnapshot };
  [IPC_CHANNELS.poemRefresh]: { args: []; result: DailyPoemRefreshResult };
  [IPC_CHANNELS.workdayStart]: { args: []; result: AppSnapshot };
  [IPC_CHANNELS.workdayEnd]: { args: []; result: AppSnapshot };
  [IPC_CHANNELS.recordsUpdate]: { args: [correction: DailyRecordCorrection]; result: AppSnapshot };
  [IPC_CHANNELS.dataExportJson]: { args: []; result: DataOperationResult };
  [IPC_CHANNELS.dataImportJson]: { args: []; result: DataOperationResult };
  [IPC_CHANNELS.dataExportCsv]: { args: []; result: DataOperationResult };
  [IPC_CHANNELS.diagnosticsExport]: { args: []; result: DataOperationResult };
  [IPC_CHANNELS.updateGetState]: { args: []; result: UpdateState };
  [IPC_CHANNELS.updateCheck]: { args: []; result: UpdateState };
  [IPC_CHANNELS.updateInstall]: { args: []; result: UpdateState };
}

export interface IpcSendContract {
  [IPC_CHANNELS.countdownAction]: [action: CountdownAction];
  [IPC_CHANNELS.fullscreenStartRest]: [];
  [IPC_CHANNELS.fullscreenCompleteRest]: [];
  [IPC_CHANNELS.fullscreenInterruptRest]: [];
}

export interface IpcEventContract {
  [IPC_CHANNELS.snapshotUpdate]: [snapshot: RealtimeSnapshot];
  [IPC_CHANNELS.updateStateUpdate]: [state: UpdateState];
}

export type IpcInvokeChannel = keyof IpcInvokeContract;
export type IpcInvokeArgs<Channel extends IpcInvokeChannel> = IpcInvokeContract[Channel]['args'];
export type IpcInvokeResult<Channel extends IpcInvokeChannel> = IpcInvokeContract[Channel]['result'];
export type IpcSendChannel = keyof IpcSendContract;
export type IpcSendArgs<Channel extends IpcSendChannel> = IpcSendContract[Channel];
export type IpcEventChannel = keyof IpcEventContract;
export type IpcEventArgs<Channel extends IpcEventChannel> = IpcEventContract[Channel];

type InvokeMethod<Channel extends IpcInvokeChannel> = (
  ...args: IpcInvokeArgs<Channel>
) => Promise<IpcInvokeResult<Channel>>;

type SendMethod<Channel extends IpcSendChannel> = (
  ...args: IpcSendArgs<Channel>
) => void;

export type SitlessApi = {
  getSnapshot: InvokeMethod<typeof IPC_CHANNELS.snapshotGet>;
  getHistory: InvokeMethod<typeof IPC_CHANNELS.historyGet>;
  updateSettings: InvokeMethod<typeof IPC_CHANNELS.settingsUpdate>;
  selectReminderImage: InvokeMethod<typeof IPC_CHANNELS.imageSelect>;
  resetReminderImage: InvokeMethod<typeof IPC_CHANNELS.imageReset>;
  setBuiltInReminderImage: InvokeMethod<typeof IPC_CHANNELS.imageSetBuiltIn>;
  testReminderFlow: InvokeMethod<typeof IPC_CHANNELS.reminderTest>;
  pauseForHour: InvokeMethod<typeof IPC_CHANNELS.reminderPauseHour>;
  focusForMinutes: InvokeMethod<typeof IPC_CHANNELS.reminderFocus>;
  resumeReminders: InvokeMethod<typeof IPC_CHANNELS.reminderResume>;
  muteToday: InvokeMethod<typeof IPC_CHANNELS.reminderMuteToday>;
  refreshDailyPoem: InvokeMethod<typeof IPC_CHANNELS.poemRefresh>;
  startWorkday: InvokeMethod<typeof IPC_CHANNELS.workdayStart>;
  endWorkday: InvokeMethod<typeof IPC_CHANNELS.workdayEnd>;
  updateDailyRecord: InvokeMethod<typeof IPC_CHANNELS.recordsUpdate>;
  exportDataJson: InvokeMethod<typeof IPC_CHANNELS.dataExportJson>;
  importDataJson: InvokeMethod<typeof IPC_CHANNELS.dataImportJson>;
  exportStatsCsv: InvokeMethod<typeof IPC_CHANNELS.dataExportCsv>;
  exportDiagnostics: InvokeMethod<typeof IPC_CHANNELS.diagnosticsExport>;
  getUpdateState: InvokeMethod<typeof IPC_CHANNELS.updateGetState>;
  checkForUpdates: InvokeMethod<typeof IPC_CHANNELS.updateCheck>;
  installUpdate: InvokeMethod<typeof IPC_CHANNELS.updateInstall>;
  countdownAction: SendMethod<typeof IPC_CHANNELS.countdownAction>;
  startRest: SendMethod<typeof IPC_CHANNELS.fullscreenStartRest>;
  completeRest: SendMethod<typeof IPC_CHANNELS.fullscreenCompleteRest>;
  interruptRest: SendMethod<typeof IPC_CHANNELS.fullscreenInterruptRest>;
  onSnapshot: (callback: (...args: IpcEventArgs<typeof IPC_CHANNELS.snapshotUpdate>) => void) => () => void;
  onUpdateState: (callback: (...args: IpcEventArgs<typeof IPC_CHANNELS.updateStateUpdate>) => void) => () => void;
};
