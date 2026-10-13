# Electron File Menu Implementation Plan

> **For agentic workers:** Use inline execution to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the settings gear top bar from App.tsx and add a native Electron application menu whose File menu opens Settings (Preference), Manage connections (Connect), and New Connection modals.

**Architecture:** Main process builds a role-based menu; clicks `webContents.send` a `menu:action` event; preload exposes `onMenuAction` subscription; App.tsx listens and flips local modal state. Manage-connections popup state is lifted from Sidebar into App so both the sidebar button and the menu can open it.

**Tech Stack:** Electron 43, React 19, TypeScript, electron-vite. No new dependencies. No unit tests exist for main/renderer — `pnpm typecheck` is the verification gate.

**Spec:** `docs/superpowers/specs/2026-10-13-electron-file-menu-design.md`

Commits are left to the user after verification (none of these tasks auto-commit).

---

### Task 1: Shared IPC channel + API type

**Files:**
- Modify: `src/shared/ipc.ts`

- [ ] **Step 1: Add `menuAction` channel constant**

In `IPC` object, after `settingsSave`, add:

```ts
  settingsGet: 'settings:get',
  settingsSave: 'settings:save',
  menuAction: 'menu:action'
} as const;
```

- [ ] **Step 2: Add `MenuAction` type and `onMenuAction` API method**

After the `IPC` object (before `InitMessage`), add:

```ts
export type MenuAction = 'open-preferences' | 'open-connections' | 'new-connection';
```

In `MongoExplorerApi`, after `saveSettings`, add:

```ts
  saveSettings(patch: Partial<AppSettings>): Promise<AppSettings>;
  onMenuAction(callback: (action: MenuAction) => void): () => void;
}
```

- [ ] **Step 3: Verify**

Run: `pnpm typecheck`
Expected: FAIL — preload no longer satisfies `MongoExplorerApi` (missing `onMenuAction`). That's the expected red state before Task 2.

---

### Task 2: Preload `onMenuAction`

**Files:**
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Import `MenuAction`**

Change the type import line to:

```ts
import type { MenuAction, MongoExplorerApi, UtilityRequest } from '../shared/ipc';
```

- [ ] **Step 2: Implement `onMenuAction`**

After `saveSettings` in the `api` object, add:

```ts
  saveSettings: (patch) => ipcRenderer.invoke(IPC.settingsSave, patch),
  onMenuAction: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, action: MenuAction) => callback(action);
    ipcRenderer.on(IPC.menuAction, handler);
    return () => ipcRenderer.removeListener(IPC.menuAction, handler);
  }
};
```

- [ ] **Step 3: Verify**

Run: `pnpm typecheck`
Expected: PASS (main/renderer still unchanged and valid).

---

### Task 3: Application menu in main process

**Files:**
- Create: `src/main/menu.ts`
- Modify: `src/main/index.ts:1-32`

- [ ] **Step 1: Create `src/main/menu.ts`**

```ts
import { Menu, app, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import { IPC, type MenuAction } from '../shared/ipc';

function sendMenuAction(win: BrowserWindow | null, action: MenuAction): void {
  if (win !== null && !win.isDestroyed()) {
    win.webContents.send(IPC.menuAction, action);
  }
}

export function createApplicationMenu(): void {
  const isMac = process.platform === 'darwin';

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
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
        ]
      : []),
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
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [{ label: 'NexDB', click: () => {} }]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
```

- [ ] **Step 2: Call it from `src/main/index.ts`**

Add import:

```ts
import { createApplicationMenu } from './menu';
```

After `createMainWindow();` inside `app.whenReady()`, add:

```ts
  createMainWindow();
  createApplicationMenu();
```

- [ ] **Step 3: Verify**

Run: `pnpm typecheck`
Expected: PASS.

---

### Task 4: Lift Manage-connections popup state into App

**Files:**
- Modify: `src/renderer/src/components/Sidebar.tsx:8-16,98-112`
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Update `SidebarProps` and remove internal popup state**

Replace the props interface and component signature/state (lines 8–16) with:

```tsx
interface SidebarProps {
  onAdd: () => void;
  onEdit: (connection: ConnectionConfig) => void;
  manageOpen: boolean;
  onManageOpen: () => void;
  onManageClose: () => void;
}

export default function Sidebar({
  onAdd,
  onEdit,
  manageOpen,
  onManageOpen,
  onManageClose
}: SidebarProps) {
  const { state, dispatch } = useApp();
  const [error, setError] = useState<string | null>(null);
```

- [ ] **Step 2: Wire the button and popup to props**

Change the Connect button's `onClick` from `() => setShowManagePopup(true)` to `onManageOpen`.

Change the popup to:

```tsx
      <ManageConnectionsPopup
        open={manageOpen}
        onClose={onManageClose}
        onAdd={onAdd}
        onEdit={onEdit}
      />
```

- [ ] **Step 3: Update `App.tsx` — remove top bar, add state + menu listener**

Full replacement for `src/renderer/src/App.tsx`:

```tsx
import { useEffect, useState } from 'react';
import ConnectionModal from './components/ConnectionModal';
import SettingsModal from './components/SettingsModal';
import Sidebar from './components/Sidebar';
import TabBar from './components/TabBar';
import TabWorkspace from './components/TabWorkspace';
import { useApp } from './context/AppState';
import { setMonacoTheme } from './lib/monaco';
import { applyTheme, resolveTheme } from './lib/theme';
import type { ConnectionConfig } from '../../shared/types';

export default function AppShell() {
  const { state, dispatch } = useApp();
  const [modal, setModal] = useState<{ open: boolean; editing: ConnectionConfig | null }>({
    open: false,
    editing: null
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [connectionsOpen, setConnectionsOpen] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([window.api.getSettings(), window.api.listConnections()])
      .then(([settings, connections]) => {
        if (!active) return;
        dispatch({ type: 'settings/loaded', settings });
        dispatch({ type: 'connections/loaded', connections });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [dispatch]);

  useEffect(() => {
    const unsubscribe = window.api.onMenuAction((action) => {
      if (action === 'open-preferences') setSettingsOpen(true);
      else if (action === 'open-connections') setConnectionsOpen(true);
      else if (action === 'new-connection') setModal({ open: true, editing: null });
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    applyTheme(state.settings.theme);
    setMonacoTheme(resolveTheme(state.settings.theme) === 'dark');
  }, [state.settings.theme]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      if (state.settings.theme !== 'system') return;
      applyTheme(state.settings.theme);
      setMonacoTheme(resolveTheme(state.settings.theme) === 'dark');
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [state.settings.theme]);

  const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId) ?? null;

  return (
    <div className="flex h-screen bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <Sidebar
        onAdd={() => setModal({ open: true, editing: null })}
        onEdit={(connection) => setModal({ open: true, editing: connection })}
        manageOpen={connectionsOpen}
        onManageOpen={() => setConnectionsOpen(true)}
        onManageClose={() => setConnectionsOpen(false)}
      />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TabBar />
        {activeTab !== null ? (
          <TabWorkspace key={activeTab.id} tab={activeTab} />
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Open a collection from the sidebar to start working.
            </p>
          </div>
        )}
      </main>
      <ConnectionModal
        open={modal.open}
        editing={modal.editing}
        onClose={() => setModal({ open: false, editing: null })}
      />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
```

- [ ] **Step 4: Verify**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Smoke test (manual)**

Run: `pnpm dev`
Expected: No top gear bar; menu bar shows File/Edit/View/Window/Help (plus app menu on macOS); `Cmd+,` opens Settings; `Cmd+O` opens Manage connections; `Cmd+N` opens New Connection; sidebar Connect button still works.
