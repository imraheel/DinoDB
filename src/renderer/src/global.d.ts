import type { MongoExplorerApi } from '../../shared/ipc';

declare global {
  interface Window {
    api: MongoExplorerApi;
    versions: { node: string; chrome: string; electron: string };
  }
}

export {};
