import {
  Menu,
  app,
  BrowserWindow,
  type BaseWindow,
  type MenuItemConstructorOptions
} from 'electron';
import { IPC, type MenuAction } from '../shared/ipc';
import { openAboutWindow } from './about';

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
        {
          label: 'About DinoDB',
          click: () => openAboutWindow()
        },
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
        {
          label: 'Close Tab',
          accelerator: 'CmdOrCtrl+W',
          click: (_menuItem, browserWindow) => sendMenuAction(browserWindow, 'close-tab')
        },
        { role: 'close', accelerator: 'CmdOrCtrl+Shift+W' },
        ...(isMac
          ? []
          : ([
              { type: 'separator' },
              { role: 'quit', accelerator: 'Ctrl+Q' }
            ] as MenuItemConstructorOptions[]))
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
        // "CmdOrCtrl+Plus" needs Shift on most layouts; also accept the unshifted "=" key.
        { role: 'zoomIn', accelerator: 'CmdOrCtrl+=', visible: false },
        { role: 'zoomOut' }
      ]
    },
    {
      // Explicit submenu: the default Windows "Window" menu binds Ctrl+W to closing the
      // window, which would shadow "Close Tab".
      label: 'Window',
      submenu: isMac
        ? [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }]
        : [{ role: 'minimize' }]
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'About DinoDB',
          click: () => openAboutWindow()
        }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
