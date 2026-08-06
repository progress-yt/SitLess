import { describe, expect, it, vi } from 'vitest';
import { IPC_CHANNELS } from '../shared/ipc';
import { handleIpc, listenIpc } from './typedIpc';

const electronMock = vi.hoisted(() => ({
  invokeHandlers: new Map<string, (...args: unknown[]) => unknown>(),
  sendHandlers: new Map<string, (...args: unknown[]) => unknown>()
}));

vi.mock('electron', () => ({
  app: {
    isPackaged: true
  },
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      electronMock.invokeHandlers.set(channel, handler);
    },
    on: (channel: string, handler: (...args: unknown[]) => unknown) => {
      electronMock.sendHandlers.set(channel, handler);
    }
  }
}));

describe('typed IPC sender checks', () => {
  it('rejects invokes and drops sends from an untrusted renderer', () => {
    const invoke = vi.fn(() => ({}) as never);
    const send = vi.fn();
    handleIpc(IPC_CHANNELS.snapshotGet, invoke);
    listenIpc(IPC_CHANNELS.fullscreenStartRest, send);
    const event = { senderFrame: { url: 'https://example.com/' } };

    expect(() => electronMock.invokeHandlers.get(IPC_CHANNELS.snapshotGet)?.(event)).toThrow(
      'Rejected IPC message from an untrusted renderer'
    );
    expect(() => electronMock.sendHandlers.get(IPC_CHANNELS.fullscreenStartRest)?.(event)).not.toThrow();
    expect(invoke).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});
