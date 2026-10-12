import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/ipc';
import type { MongoExplorerApi, UtilityRequest } from '../shared/ipc';

const api: MongoExplorerApi = {
  listConnections: () => ipcRenderer.invoke(IPC.connectionsList),
  saveConnection: (input) => ipcRenderer.invoke(IPC.connectionsSave, input),
  deleteConnection: (id) => ipcRenderer.invoke(IPC.connectionsDelete, id),
  testConnection: (input) => ipcRenderer.invoke(IPC.connectionsTest, input),
  connectSession: (id) => ipcRenderer.invoke(IPC.sessionsConnect, id),
  listCollections: (connectionId, database) =>
    ipcRenderer.invoke(IPC.sessionsCollections, { connectionId, database }),
  disconnectSession: (id) => ipcRenderer.invoke(IPC.sessionsDisconnect, id),
  createTab: (input) => ipcRenderer.invoke(IPC.tabsCreate, input),
  executeTab: ((tabId: string, request: UtilityRequest) =>
    ipcRenderer.invoke(IPC.tabsExecute, { tabId, request })) as MongoExplorerApi['executeTab'],
  closeTab: (id) => ipcRenderer.invoke(IPC.tabsClose, id),
  getSettings: () => ipcRenderer.invoke(IPC.settingsGet),
  saveSettings: (patch) => ipcRenderer.invoke(IPC.settingsSave, patch)
};

contextBridge.exposeInMainWorld('api', api);
contextBridge.exposeInMainWorld('versions', {
  node: process.versions.node,
  chrome: process.versions.chrome,
  electron: process.versions.electron
});
