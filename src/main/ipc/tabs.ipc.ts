import { ipcMain } from 'electron';
import { IPC } from '../../shared/ipc';
import type { CreateTabInput, UtilityRequest } from '../../shared/ipc';
import { SCHEMA_SAMPLE_SIZE } from '../../shared/types';
import { getConnection } from '../db/connections.repo';
import { getSettings } from '../db/settings.repo';
import type { IpcDeps } from './index';

export function registerTabsIpc(deps: IpcDeps): void {
  ipcMain.handle(IPC.tabsCreate, (_event, input: CreateTabInput) => {
    const connection = getConnection(deps.db(), input.connectionId);
    if (connection === null) throw new Error(`Connection not found: ${input.connectionId}`);
    return deps.tabs.create(input, connection, SCHEMA_SAMPLE_SIZE);
  });

  ipcMain.handle(IPC.tabsExecute, (_event, payload: { tabId: string; request: UtilityRequest }) => {
    const settings = getSettings(deps.db());
    return deps.tabs.execute(payload.tabId, payload.request, settings.maxTimeMs);
  });

  ipcMain.handle(IPC.tabsClose, (_event, tabId: string) => {
    deps.tabs.close(tabId);
    return null;
  });
}
