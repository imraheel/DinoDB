# NexDB — Application Menu Design Spec

Move app-level actions (Settings, Connect, New Connection) out of the renderer chrome and into a native Electron application menu.

**Status:** Approved (2026-10-13)

## Goals

- Remove the top-right settings gear bar from `App.tsx`.
- Add a full standard application menu (File, Edit, View, Window, Help).
- File menu entries open existing modals:
  - **New Connection** (`CmdOrCtrl+N`) → New connection modal (blank form)
  - **Connect** (`CmdOrCtrl+O`) → Manage connections popup
  - **Preference** (`CmdOrCtrl+,`) → Settings modal
- Sidebar "Connect" button stays as an additional entry point (both menu and button coexist).

## Decisions

| Topic | Decision |
|---|---|
| Menu scope | Full standard menu bar; File carries the new actions |
| Menu bar entries (File) | New Connection, Connect, Preference, Quit |
| Accelerators | `CmdOrCtrl+,` Preference · `CmdOrCtrl+O` Connect · `CmdOrCtrl+N` New Connection · role-based defaults elsewhere |
| macOS app menu | Prepend standard app menu (About/Hide/Quit) per Electron docs |
| Main→renderer plumbing | `webContents.send('menu:action', action)` + preload `onMenuAction` subscription |
| Modal open state | Stays local in `App.tsx`; Manage-connections popup state lifted from `Sidebar` so the menu can open it |
| Sidebar Connect button | Kept; menu item is additive |

## Architecture

```
MenuItem click (main)
  └─► webContents.send('menu:action', 'open-preferences' | 'open-connections' | 'new-connection')
        └─► preload: ipcRenderer.on('menu:action') → api.onMenuAction(cb) → unsubscribe fn
              └─► App.tsx useEffect listener
                    ├─ 'open-preferences' → setSettingsOpen(true)
                    ├─ 'open-connections' → setConnectionsOpen(true)
                    └─ 'new-connection'   → setModal({ open: true, editing: null })
```

## Components

### 1. Remove top bar (`src/renderer/src/App.tsx`)

Delete the `<div>` containing the settings gear button (lines ~59–68). Settings is now menu-only.

### 2. New `src/main/menu.ts`

`createApplicationMenu(): void`

- Build a `MenuItemConstructorOptions[]` template.
- **File** — Preference (`CmdOrCtrl+,`), Connect (`CmdOrCtrl+O`), New Connection (`CmdOrCtrl+N`), separator, Quit (role `quit`).
- **Edit** — roles: undo, redo, cut, copy, paste, selectAll.
- **View** — roles: reload, toggleDevTools, resetZoom, zoomIn, zoomOut.
- **Window** — roles: minimize, zoom, close (platform-appropriate).
- **Help** — single "NexDB" item, no-op click handler (no docs URL yet).
- On `process.platform === 'darwin'`, prepend the standard app menu (about, hide, hideOthers, unhide, separator, quit).
- Click handlers use the `browserWindow` argument from the `MenuItem` click signature (`(menuItem, browserWindow) => …`); guard sends with `if (win && !win.isDestroyed())`.

### 3. IPC plumbing

**`src/shared/ipc.ts`**

- `IPC.menuAction = 'menu:action'`
- `type MenuAction = 'open-preferences' | 'open-connections' | 'new-connection'`
- `MongoExplorerApi.onMenuAction(cb: (action: MenuAction) => void): () => void` (returns unsubscribe)

**`src/preload/index.ts`**

- `onMenuAction`: `ipcRenderer.on(IPC.menuAction, handler)`; returned function removes the listener.

**No new `ipcMain.handle`** — this channel is main→renderer only.

### 4. `src/main/index.ts`

Call `createApplicationMenu()` after `createMainWindow()` inside `app.whenReady()`.

### 5. `src/renderer/src/App.tsx`

- Keep `settingsOpen` and `modal` state.
- Add `connectionsOpen` state; pass to `Sidebar` as props.
- `useEffect` subscribing to `window.api.onMenuAction`:

  ```ts
  useEffect(() => {
    const unsubscribe = window.api.onMenuAction((action) => {
      if (action === 'open-preferences') setSettingsOpen(true);
      else if (action === 'open-connections') setConnectionsOpen(true);
      else if (action === 'new-connection') setModal({ open: true, editing: null });
    });
    return unsubscribe;
  }, []);
  ```

### 6. `src/renderer/src/components/Sidebar.tsx`

- Remove internal `showManagePopup` state.
- Accept props: `manageOpen: boolean`, `onManageOpen(): void`, `onManageClose(): void`.
- Connect button calls `onManageOpen()`; `ManageConnectionsPopup` gets `open={manageOpen}` / `onClose={onManageClose}`.

## Error handling

- `webContents.send` guarded by `!win.isDestroyed()`.
- Unsubscribe returned by `onMenuAction` cleans up the `ipcRenderer` listener on unmount.
- No new failure modes in the modal flows themselves.

## Testing / verification

- `pnpm typecheck` must pass (covers `tsconfig.node.json` main/preload and `tsconfig.web.json` renderer).
- Manual smoke test (`pnpm dev`): menu renders; each File item opens the correct modal; accelerators work; sidebar Connect still works.
