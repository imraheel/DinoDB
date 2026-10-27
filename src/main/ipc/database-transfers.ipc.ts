import { ipcMain } from 'electron';
import { IPC } from '../../shared/ipc';
import type {
  DatabaseTransferInput,
  DatabaseTransferOptions
} from '../../shared/database-transfer';
import type { IpcDeps } from './index';
export function registerDatabaseTransfersIpc(deps: IpcDeps): void {
  ipcMain.handle(IPC.databaseTransferCreate, (event, input: DatabaseTransferInput) =>
    deps.databaseTransfers.create(input, event.sender)
  );
  ipcMain.handle(
    IPC.databaseTransferChoose,
    (event, input: { tabId: string; inputKind: 'archive' | 'directory'; gzip: boolean }) =>
      deps.databaseTransfers.choosePath(input.tabId, event.sender, input.inputKind, input.gzip)
  );
  ipcMain.handle(
    IPC.databaseTransferStart,
    (event, input: { tabId: string; options: DatabaseTransferOptions }) =>
      deps.databaseTransfers.start(input.tabId, event.sender, input.options)
  );
  ipcMain.handle(IPC.databaseTransferSnapshot, (event, id: string) =>
    deps.databaseTransfers.snapshot(id, event.sender)
  );
  ipcMain.handle(IPC.databaseTransferCancel, (event, id: string) =>
    deps.databaseTransfers.cancel(id, event.sender)
  );
}
