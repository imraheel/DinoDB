import { BrowserWindow, ipcMain, nativeTheme } from 'electron';
import { IPC } from '../../shared/ipc';
import type { AppSettings } from '../../shared/types';
import { getSettings, saveSettings } from '../db/settings.repo';
import { applyWindowVibrancy } from '../window';
import type { IpcDeps } from './index';

export function registerSettingsIpc(deps: IpcDeps): void {
  ipcMain.handle(IPC.settingsGet, () => getSettings(deps.db()));

  ipcMain.handle(IPC.settingsSave, (event, patch: Partial<AppSettings>) => {
    const saved = saveSettings(deps.db(), patch);
    nativeTheme.themeSource = saved.theme;
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win !== null) applyWindowVibrancy(win, saved.theme, saved.vibrancy);
    return saved;
  });
}
