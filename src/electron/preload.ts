import { contextBridge, ipcRenderer } from 'electron';
import type { AppSettings, AppSnapshot, CountdownAction, ImageSelectionResult } from '../shared/types';

const api = {
  getSnapshot: (): Promise<AppSnapshot> => ipcRenderer.invoke('snapshot:get'),
  updateSettings: (settings: AppSettings): Promise<AppSettings> => ipcRenderer.invoke('settings:update', settings),
  selectReminderImage: (): Promise<ImageSelectionResult> => ipcRenderer.invoke('image:select'),
  resetReminderImage: (): Promise<AppSettings> => ipcRenderer.invoke('image:reset'),
  testReminderFlow: (): Promise<AppSnapshot> => ipcRenderer.invoke('reminder:test'),
  pauseForHour: (): Promise<AppSnapshot> => ipcRenderer.invoke('reminder:pause-hour'),
  muteToday: (): Promise<AppSnapshot> => ipcRenderer.invoke('reminder:mute-today'),
  startWorkday: (): Promise<AppSnapshot> => ipcRenderer.invoke('workday:start'),
  endWorkday: (): Promise<AppSnapshot> => ipcRenderer.invoke('workday:end'),
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
