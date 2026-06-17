import { contextBridge, ipcRenderer } from 'electron';
import type { AppSettings, AppSnapshot, BuiltInReminderImageId, CountdownAction, DailyPoemRefreshResult, DailyRecordCorrection, ImageSelectionResult } from '../shared/types';

const api = {
  getSnapshot: (): Promise<AppSnapshot> => ipcRenderer.invoke('snapshot:get'),
  updateSettings: (settings: AppSettings): Promise<AppSettings> => ipcRenderer.invoke('settings:update', settings),
  selectReminderImage: (): Promise<ImageSelectionResult> => ipcRenderer.invoke('image:select'),
  resetReminderImage: (): Promise<AppSettings> => ipcRenderer.invoke('image:reset'),
  setBuiltInReminderImage: (imageId: BuiltInReminderImageId): Promise<AppSettings> => ipcRenderer.invoke('image:set-built-in', imageId),
  testReminderFlow: (): Promise<AppSnapshot> => ipcRenderer.invoke('reminder:test'),
  pauseForHour: (): Promise<AppSnapshot> => ipcRenderer.invoke('reminder:pause-hour'),
  resumeReminders: (): Promise<AppSnapshot> => ipcRenderer.invoke('reminder:resume'),
  muteToday: (): Promise<AppSnapshot> => ipcRenderer.invoke('reminder:mute-today'),
  refreshDailyPoem: (): Promise<DailyPoemRefreshResult> => ipcRenderer.invoke('poem:refresh'),
  startWorkday: (): Promise<AppSnapshot> => ipcRenderer.invoke('workday:start'),
  endWorkday: (): Promise<AppSnapshot> => ipcRenderer.invoke('workday:end'),
  updateDailyRecord: (correction: DailyRecordCorrection): Promise<AppSnapshot> => ipcRenderer.invoke('records:update', correction),
  countdownAction: (action: CountdownAction): void => ipcRenderer.send('countdown:action', action),
  completeRest: (): void => ipcRenderer.send('fullscreen:complete-rest'),
  onSnapshot: (callback: (snapshot: AppSnapshot) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, snapshot: AppSnapshot) => callback(snapshot);
    ipcRenderer.on('snapshot:update', listener);
    return () => ipcRenderer.removeListener('snapshot:update', listener);
  }
};

contextBridge.exposeInMainWorld('sitless', api);

export type SitlessApi = typeof api;
