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
import type { AppSettings } from '../shared/types';
import { DEFAULT_SETTINGS } from '../shared/types';

let cachedSettings: AppSettings = DEFAULT_SETTINGS;

app.whenReady().then(() => {
  const db = getDb(path.join(app.getPath('userData'), 'nexdb.db'));
  const utilityDeps = createUtilityDeps();
  const sessions = new SessionManager(utilityDeps, (id) => getConnection(db, id));
  const tabs = new TabManager(utilityDeps);
  registerAllIpc({ db: () => db, sessions, tabs, utilityDeps });
  cachedSettings = getSettings(db);
  nativeTheme.themeSource = cachedSettings.theme;
  createMainWindow(cachedSettings);
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
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow(cachedSettings);
});
