import { app, ipcMain, type IpcMainEvent, type IpcMainInvokeEvent, type WebContents } from 'electron';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type {
  IpcEventArgs,
  IpcEventChannel,
  IpcInvokeArgs,
  IpcInvokeChannel,
  IpcInvokeResult,
  IpcSendArgs,
  IpcSendChannel
} from '../shared/ipc';
import { getTrustedDevServerUrl, isTrustedRendererUrl } from './rendererSecurity';

type MaybePromise<Value> = Value | Promise<Value>;

export function handleIpc<Channel extends IpcInvokeChannel>(
  channel: Channel,
  handler: (...args: IpcInvokeArgs<Channel>) => MaybePromise<IpcInvokeResult<Channel>>
): void {
  ipcMain.handle(channel, (event: IpcMainInvokeEvent, ...args: unknown[]) => {
    if (!isTrustedSender(event)) {
      throw new Error('Rejected IPC message from an untrusted renderer');
    }
    return handler(...args as IpcInvokeArgs<Channel>);
  });
}

export function listenIpc<Channel extends IpcSendChannel>(
  channel: Channel,
  handler: (...args: IpcSendArgs<Channel>) => void
): void {
  ipcMain.on(channel, (event: IpcMainEvent, ...args: unknown[]) => {
    if (!isTrustedSender(event)) {
      return;
    }
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

function isTrustedSender(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
  const rendererFileUrl = pathToFileURL(join(__dirname, '../../dist/index.html')).toString();
  const devServerUrl = getTrustedDevServerUrl(process.env.VITE_DEV_SERVER_URL, app.isPackaged);
  return Boolean(
    event.senderFrame &&
    isTrustedRendererUrl(event.senderFrame.url, rendererFileUrl, devServerUrl)
  );
}
