import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent, type WebContents } from 'electron';
import type {
  IpcEventArgs,
  IpcEventChannel,
  IpcInvokeArgs,
  IpcInvokeChannel,
  IpcInvokeResult,
  IpcSendArgs,
  IpcSendChannel
} from '../shared/ipc';

type MaybePromise<Value> = Value | Promise<Value>;

export function handleIpc<Channel extends IpcInvokeChannel>(
  channel: Channel,
  handler: (...args: IpcInvokeArgs<Channel>) => MaybePromise<IpcInvokeResult<Channel>>
): void {
  ipcMain.handle(channel, (_event: IpcMainInvokeEvent, ...args: unknown[]) => {
    return handler(...args as IpcInvokeArgs<Channel>);
  });
}

export function listenIpc<Channel extends IpcSendChannel>(
  channel: Channel,
  handler: (...args: IpcSendArgs<Channel>) => void
): void {
  ipcMain.on(channel, (_event: IpcMainEvent, ...args: unknown[]) => {
    handler(...args as IpcSendArgs<Channel>);
  });
}

export function sendIpc<Channel extends IpcEventChannel>(
  webContents: WebContents,
  channel: Channel,
  ...args: IpcEventArgs<Channel>
): void {
  webContents.send(channel, ...args);
}
