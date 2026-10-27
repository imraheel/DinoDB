import { ipcMain } from 'electron';
import { IPC } from '../../shared/ipc';
import type { CreateTabInput, UtilityRequest } from '../../shared/ipc';
import { SCHEMA_SAMPLE_SIZE } from '../../shared/types';
import { getConnection } from '../db/connections.repo';
import { getSettings } from '../db/settings.repo';
import type { IpcDeps } from './index';

export function registerTabsIpc(deps: IpcDeps): void {
  ipcMain.handle(IPC.tabsCreate, (event, input: CreateTabInput) => {
    const connection = getConnection(deps.db(), input.connectionId);
    if (connection === null) throw new Error(`Connection not found: ${input.connectionId}`);
    if (input.kind === 'import' || input.kind === 'export') {
      const tabId = deps.transfers.create({ ...input, direction: input.kind }, event.sender);
      return { tabId, fields: [] };
    }
    return deps.tabs.create(input, connection, SCHEMA_SAMPLE_SIZE);
  });

  ipcMain.handle(IPC.tabsExecute, (_event, payload: { tabId: string; request: UtilityRequest }) => {
    const settings = getSettings(deps.db());
    return deps.tabs.execute(payload.tabId, payload.request, settings.maxTimeMs);
  });

  ipcMain.handle(IPC.tabsClose, (event, tabId: string) => {
    if (deps.transfers.owns(tabId, event.sender)) deps.transfers.close(tabId);
    else deps.tabs.close(tabId);
    return null;
  });
}
