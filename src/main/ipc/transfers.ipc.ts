import { ipcMain } from 'electron';
import { IPC } from '../../shared/ipc';
import type { TransferFormat } from '../../shared/transfer';
import { getConnection } from '../db/connections.repo';
import type { IpcDeps } from './index';

export function registerTransfersIpc(deps: IpcDeps): void {
  ipcMain.handle(
    IPC.transferChooseFile,
    (event, input: { tabId: string; format: TransferFormat }) =>
      deps.transfers.chooseFile(input.tabId, event.sender, input.format)
  );
  ipcMain.handle(IPC.transferStart, (event, input: { tabId: string; format: TransferFormat }) => {
    const target = deps.transfers.target(input.tabId, event.sender);
    if (
      target.direction === 'import' &&
      deps.databaseTransfers.hasActiveRestore(target.connectionId, target.database)
    ) {
      throw new Error(
        'A database restore is using this target. Wait for it to finish before importing.'
      );
    }
    const connectionId = deps.transfers.connectionId(input.tabId, event.sender);
    const connection = getConnection(deps.db(), connectionId);
    if (!connection) throw new Error('Connection no longer exists.');
    return deps.transfers.start(input.tabId, event.sender, input.format, connection);
  });
  ipcMain.handle(IPC.transferCancel, (event, tabId: string) =>
    deps.transfers.cancel(tabId, event.sender)
  );
  ipcMain.handle(IPC.transferSnapshot, (event, tabId: string) =>
    deps.transfers.snapshot(tabId, event.sender)
  );
}
