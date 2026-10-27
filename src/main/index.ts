import { TransfersManager } from './services/transfers-manager';
import { DatabaseTools } from './services/database-tools';
import { DatabaseTransfersManager } from './services/database-transfers-manager';
import { app, BrowserWindow, nativeTheme } from 'electron';
import * as path from 'node:path';
import { getConnection } from './db/connections.repo';
import { closeDb, getDb } from './db/database';
import { getSettings } from './db/settings.repo';
import { registerAllIpc } from './ipc';
import { createUtilityDeps } from './services/fork';
import { SessionManager } from './services/sessions-manager';
import { TabManager } from './services/tabs-manager';
import { createApplicationMenu } from './menu';
import { createMainWindow } from './window';

app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-frame-navigate', (event) => event.preventDefault());
  contents.on('will-redirect', (event) => event.preventDefault());
});

app.whenReady().then(() => {
  const db = getDb(path.join(app.getPath('userData'), 'nexdb.db'));
  const utilityDeps = createUtilityDeps();
  const sessions = new SessionManager(utilityDeps, (id) => getConnection(db, id));
  const tabs = new TabManager(utilityDeps);
  const transfers = new TransfersManager();
  const databaseTools = new DatabaseTools();
  const databaseTransfers = new DatabaseTransfersManager(
    databaseTools,
    () => getSettings(db),
    (id) => getConnection(db, id),
    (id, database) => transfers.hasActiveImport(id, database)
  );
  registerAllIpc({
    db: () => db,
    sessions,
    tabs,
    transfers,
    databaseTools,
    databaseTransfers,
    utilityDeps
  });
  const settings = getSettings(db);
  nativeTheme.themeSource = settings.theme;
  createMainWindow(settings.theme);
  createApplicationMenu();
  let quitting = false;
  let shutdownReady = false;
  app.on('before-quit', (event) => {
    if (shutdownReady) return;
    event.preventDefault();
    if (quitting) return;
    quitting = true;
    void databaseTransfers.disposeAll().finally(() => {
      shutdownReady = true;
      app.quit();
    });
  });

  app.on('will-quit', () => {
    transfers.disposeAll();
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
