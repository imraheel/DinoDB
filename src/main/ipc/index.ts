import type { DatabaseHandle } from '../db/database';
import type { UtilityClientDeps } from '../services/utility-client';
import type { SessionManager } from '../services/sessions-manager';
import type { TabManager } from '../services/tabs-manager';
import { registerConnectionsIpc } from './connections.ipc';
import { registerSessionsIpc } from './sessions.ipc';
import { registerSettingsIpc } from './settings.ipc';
import { registerTabsIpc } from './tabs.ipc';

export interface IpcDeps {
  db: () => DatabaseHandle;
  sessions: SessionManager;
  tabs: TabManager;
  utilityDeps: UtilityClientDeps;
}

export function registerAllIpc(deps: IpcDeps): void {
  registerConnectionsIpc(deps);
  registerSessionsIpc(deps);
  registerTabsIpc(deps);
  registerSettingsIpc(deps);
}
