import { app, BrowserWindow } from 'electron';
import * as path from 'node:path';
import { getConnection } from './db/connections.repo';
import { closeDb, getDb } from './db/database';
import { registerAllIpc } from './ipc';
import { createUtilityDeps } from './services/fork';
import { SessionManager } from './services/sessions-manager';
import { TabManager } from './services/tabs-manager';
import { createApplicationMenu } from './menu';
import { createMainWindow } from './window';

app.whenReady().then(() => {
  const db = getDb(path.join(app.getPath('userData'), 'nexdb.db'));
  const utilityDeps = createUtilityDeps();
  const sessions = new SessionManager(utilityDeps, (id) => getConnection(db, id));
  const tabs = new TabManager(utilityDeps);
  registerAllIpc({ db: () => db, sessions, tabs, utilityDeps });
  createMainWindow();
  createApplicationMenu();

  app.on('will-quit', () => {
    tabs.disposeAll();
    sessions.disposeAll();
    closeDb();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});
