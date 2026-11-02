import { ipcMain } from 'electron';
import { IPC } from '../../shared/ipc';
import type { IpcDeps } from './index';
export function registerShellsIpc(deps: IpcDeps): void {
  ipcMain.handle(IPC.shellStart, (event, input: { tabId: string; script: string }) =>
    deps.shells.start(input.tabId, event.sender, input.script)
  );
  ipcMain.handle(IPC.shellCancel, (event, id: string) => deps.shells.cancel(id, event.sender));
  ipcMain.handle(IPC.shellSnapshot, (event, id: string) => deps.shells.snapshot(id, event.sender));
}
