import type { TransfersManager } from '../services/transfers-manager';
import type { DatabaseTools } from '../services/database-tools';
import type { DatabaseTransfersManager } from '../services/database-transfers-manager';
import { registerDatabaseToolsIpc } from './database-tools.ipc';
import { registerDatabaseTransfersIpc } from './database-transfers.ipc';
import { registerTransfersIpc } from './transfers.ipc';
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
  transfers: TransfersManager;
  databaseTools: DatabaseTools;
  databaseTransfers: DatabaseTransfersManager;
  utilityDeps: UtilityClientDeps;
}

export function registerAllIpc(deps: IpcDeps): void {
  registerConnectionsIpc(deps);
  registerSessionsIpc(deps);
  registerTabsIpc(deps);
  registerTransfersIpc(deps);
  registerDatabaseToolsIpc(deps);
  registerDatabaseTransfersIpc(deps);
  registerSettingsIpc(deps);
}
