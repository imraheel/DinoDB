import { app, BrowserWindow, nativeTheme } from 'electron';
import * as path from 'node:path';
import { DEFAULT_SETTINGS } from '../shared/types';
import type { AppSettings } from '../shared/types';

function windowIconPath(): string | undefined {
  if (process.platform === 'darwin') {
    return undefined; // macOS uses the bundled .icns
  }
  const iconFile = 'build/icon.png';
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app.asar.unpacked', iconFile);
  }
  return path.join(app.getAppPath(), iconFile);
}

function solidBackgroundColor(theme: AppSettings['theme']): string {
  const dark = theme === 'dark' || (theme === 'system' && nativeTheme.shouldUseDarkColors);
  return dark ? '#1E1E1E' : '#FFFFFF';
}

function initialBackgroundColor(settings: AppSettings): string {
  if (process.platform === 'darwin') {
    return settings.vibrancy ? 'rgba(0,0,0,0)' : solidBackgroundColor(settings.theme);
  }
  return solidBackgroundColor(settings.theme);
}

export function applyWindowVibrancy(
  win: BrowserWindow,
  theme: AppSettings['theme'],
  enabled: boolean
): void {
  if (process.platform !== 'darwin') return;
  win.setVibrancy(enabled ? 'sidebar' : null);
  win.setBackgroundColor(enabled ? 'rgba(0,0,0,0)' : solidBackgroundColor(theme));
}

export function createMainWindow(settings: AppSettings = DEFAULT_SETTINGS): BrowserWindow {
  const isMac = process.platform === 'darwin';

  const options: Electron.BrowserWindowConstructorOptions = {
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: initialBackgroundColor(settings),
    icon: windowIconPath(),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  };

  if (isMac) {
    options.titleBarStyle = 'hiddenInset';
    options.trafficLightPosition = { x: 12, y: 12 };
    if (settings.vibrancy) options.vibrancy = 'sidebar';
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
