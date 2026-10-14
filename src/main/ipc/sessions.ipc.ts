import { ipcMain } from 'electron';
import { IPC } from '../../shared/ipc';
import { touchLastConnected } from '../db/connections.repo';
import type { IpcDeps } from './index';

export function registerSessionsIpc(deps: IpcDeps): void {
  ipcMain.handle(IPC.sessionsConnect, (_event, connectionId: string) =>
    deps.sessions.connect(connectionId).then((result) => {
      touchLastConnected(deps.db(), connectionId);
      return result;
    })
  );

  ipcMain.handle(IPC.sessionsCollections, (_event, payload: { connectionId: string; database: string }) =>
    deps.sessions.listCollections(payload.connectionId, payload.database).then((collections) => ({ collections }))
  );

  ipcMain.handle(IPC.sessionsDisconnect, (_event, connectionId: string) => {
    deps.sessions.disconnect(connectionId);
    return null;
  });
}
