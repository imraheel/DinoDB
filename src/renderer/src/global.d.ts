import type { MongoExplorerApi } from '../../shared/ipc';

declare global {
  const __APP_VERSION__: string;
  interface Window {
    api: MongoExplorerApi;
    versions: { node: string; chrome: string; electron: string };
  }
}

export {};
