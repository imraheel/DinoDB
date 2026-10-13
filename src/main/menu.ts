import {
  Menu,
  app,
  BrowserWindow,
  type BaseWindow,
  type MenuItemConstructorOptions
} from 'electron';
import { IPC, type MenuAction } from '../shared/ipc';

function sendMenuAction(win: BaseWindow | undefined, action: MenuAction): void {
  if (win instanceof BrowserWindow && !win.isDestroyed()) {
    win.webContents.send(IPC.menuAction, action);
  }
}

export function createApplicationMenu(): void {
  const isMac = process.platform === 'darwin';

  const macAppMenu: MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }
  ];

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? macAppMenu : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'New Connection',
          accelerator: 'CmdOrCtrl+N',
          click: (_menuItem, browserWindow) => sendMenuAction(browserWindow, 'new-connection')
        },
        {
          label: 'Connect',
          accelerator: 'CmdOrCtrl+O',
          click: (_menuItem, browserWindow) => sendMenuAction(browserWindow, 'open-connections')
        },
        {
          label: 'Preference',
          accelerator: 'CmdOrCtrl+,',
          click: (_menuItem, browserWindow) => sendMenuAction(browserWindow, 'open-preferences')
        },
        { type: 'separator' },
        ...(isMac
          ? ([{ role: 'close' }] as MenuItemConstructorOptions[])
          : ([{ role: 'quit' }] as MenuItemConstructorOptions[]))
      ]
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' }
      ]
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [{ label: 'NexDB', click: () => {} }]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
