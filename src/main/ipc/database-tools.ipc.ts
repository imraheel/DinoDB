import { dialog, ipcMain } from 'electron';
import { IPC } from '../../shared/ipc';
import { toolName, type DatabaseToolsPaths } from '../../shared/database-tools';
import { getSettings } from '../db/settings.repo';
import type { IpcDeps } from './index';
export function registerDatabaseToolsIpc(deps: IpcDeps): void {
  ipcMain.handle(IPC.databaseToolsBrowse, async (_event, name: unknown) => {
    const tool = toolName(name);
    const result = await dialog.showOpenDialog({
      title: `Choose ${tool} executable`,
      properties: ['openFile'],
      ...(process.platform === 'win32'
        ? { filters: [{ name: 'Executable', extensions: ['exe'] }] }
        : {})
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });
  ipcMain.handle(IPC.databaseToolsTest, (_event, paths: DatabaseToolsPaths) => {
    if (
      !paths ||
      typeof paths.mongodumpPath !== 'string' ||
      typeof paths.mongorestorePath !== 'string'
    )
      throw new Error('Invalid tool paths.');
    return deps.databaseTools.test(paths);
  });
  ipcMain.handle(IPC.databaseToolsDetect, () => deps.databaseTools.test(getSettings(deps.db())));
}
