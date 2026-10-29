import { utilityProcess } from 'electron';
import * as path from 'node:path';
import type { ForkedProcess, UtilityClientDeps } from './utility-client';

export function createUtilityDeps(): UtilityClientDeps {
  return {
    resolveScriptPath: () => path.join(__dirname, '..', 'utility', 'index.js'),
    fork: (scriptPath: string): ForkedProcess => {
      const options = { name: 'dinodb-worker', serviceName: 'dinodb-worker' };
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
