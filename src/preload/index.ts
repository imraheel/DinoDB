import type { TransferProgress } from '../shared/transfer';
import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/ipc';
import type { MenuAction, MongoExplorerApi, UtilityRequest } from '../shared/ipc';

const api: MongoExplorerApi = {
  listConnections: () => ipcRenderer.invoke(IPC.connectionsList),
  saveConnection: (input) => ipcRenderer.invoke(IPC.connectionsSave, input),
  deleteConnection: (id) => ipcRenderer.invoke(IPC.connectionsDelete, id),
  testConnection: (input) => ipcRenderer.invoke(IPC.connectionsTest, input),
  connectSession: (id) => ipcRenderer.invoke(IPC.sessionsConnect, id),
  listCollections: (connectionId, database) =>
    ipcRenderer.invoke(IPC.sessionsCollections, { connectionId, database }),
  disconnectSession: (id) => ipcRenderer.invoke(IPC.sessionsDisconnect, id),
  adminSession: ((connectionId: string, request: UtilityRequest) =>
    ipcRenderer.invoke(IPC.sessionsAdmin, {
      connectionId,
      request
    })) as MongoExplorerApi['adminSession'],
  createTab: (input) => ipcRenderer.invoke(IPC.tabsCreate, input),
  executeTab: ((tabId: string, request: UtilityRequest) =>
    ipcRenderer.invoke(IPC.tabsExecute, { tabId, request })) as MongoExplorerApi['executeTab'],
  closeTab: (id) => ipcRenderer.invoke(IPC.tabsClose, id),
  chooseTransferFile: (tabId, format) =>
    ipcRenderer.invoke(IPC.transferChooseFile, { tabId, format }),
  startTransfer: (tabId, format) => ipcRenderer.invoke(IPC.transferStart, { tabId, format }),
  cancelTransfer: (tabId) => ipcRenderer.invoke(IPC.transferCancel, tabId),
  transferSnapshot: (tabId) => ipcRenderer.invoke(IPC.transferSnapshot, tabId),
  onTransferProgress: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: TransferProgress) =>
      callback(progress);
    ipcRenderer.on(IPC.transferProgress, handler);
    return () => ipcRenderer.removeListener(IPC.transferProgress, handler);
  },
  getSettings: () => ipcRenderer.invoke(IPC.settingsGet),
  saveSettings: (patch) => ipcRenderer.invoke(IPC.settingsSave, patch),
  onMenuAction: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, action: MenuAction) => callback(action);
    ipcRenderer.on(IPC.menuAction, handler);
    return () => ipcRenderer.removeListener(IPC.menuAction, handler);
  }
};

contextBridge.exposeInMainWorld('api', api);
contextBridge.exposeInMainWorld('versions', {
  node: process.versions.node,
  chrome: process.versions.chrome,
  electron: process.versions.electron
});
