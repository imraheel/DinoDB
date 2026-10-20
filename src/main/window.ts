import { app, BrowserWindow, nativeTheme } from 'electron';
import * as path from 'node:path';
import type { AppSettings } from '../shared/types';

function windowIconPath(): string | undefined {
  if (process.platform === 'darwin') {
    return undefined;
  }
  const iconFile = process.platform === 'win32' ? 'build/icon.ico' : 'build/icon.png';
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app.asar.unpacked', iconFile);
  }
  return path.join(app.getAppPath(), iconFile);
}

function backgroundColorFor(theme: AppSettings['theme']): string {
  const dark = theme === 'dark' || (theme === 'system' && nativeTheme.shouldUseDarkColors);
  return dark ? '#1E1E1E' : '#FFFFFF';
}

export function createMainWindow(theme: AppSettings['theme'] = 'system'): BrowserWindow {
  const options: Electron.BrowserWindowConstructorOptions = {
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: backgroundColorFor(theme),
    icon: windowIconPath(),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  };

  if (process.platform === 'darwin') {
    options.titleBarStyle = 'hiddenInset';
    options.trafficLightPosition = { x: 12, y: 12 };
  }

  const win = new BrowserWindow(options);

  win.once('ready-to-show', () => win.show());

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  return win;
}
