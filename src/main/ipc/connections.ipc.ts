import { ipcMain } from 'electron';
import { IPC } from '../../shared/ipc';
import type { ConnectionInput } from '../../shared/types';
import { validateConnection } from '../../shared/validate';
import { deleteConnection, listConnections, saveConnection } from '../db/connections.repo';
import { testConnection } from '../services/test-connection';
import type { IpcDeps } from './index';

export function registerConnectionsIpc(deps: IpcDeps): void {
  ipcMain.handle(IPC.connectionsList, () => listConnections(deps.db()));

  ipcMain.handle(IPC.connectionsSave, (_event, input: ConnectionInput) => {
    const errors = validateConnection(input);
    if (errors.length > 0) throw new Error(errors.join('; '));
    return saveConnection(deps.db(), input);
  });

  ipcMain.handle(IPC.connectionsDelete, (_event, id: string) => {
    deleteConnection(deps.db(), id);
    deps.sessions.disconnect(id);
    deps.tabs.closeForConnection(id);
  });

  ipcMain.handle(IPC.connectionsTest, (_event, input: ConnectionInput) =>
    testConnection(input, deps.utilityDeps)
  );
}
