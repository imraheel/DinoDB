import { app, utilityProcess } from 'electron';
import * as path from 'node:path';
import type { ForkedProcess, UtilityClientDeps } from './utility-client';

export function createUtilityDeps(): UtilityClientDeps {
  return {
    resolveScriptPath: () => {
      const scriptPath = path.join(__dirname, '..', 'utility', 'index.js');
      if (!app.isPackaged) return scriptPath;
      return scriptPath.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
    },
    fork: (scriptPath: string): ForkedProcess => {
      const options = { name: 'nexdb-worker', serviceName: 'nexdb-worker' };
      const child = utilityProcess.fork(scriptPath, [], options);
      return {
        postMessage: (message) => {
          child.postMessage(message);
        },
        on: (event, listener) => {
          if (event === 'message') child.on('message', listener as never);
          else child.on('exit', listener as never);
        },
        kill: () => child.kill()
      };
    }
  };
}
