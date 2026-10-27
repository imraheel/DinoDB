import type { DatabaseToWorker, DatabaseFromWorker } from '../shared/database-transfer';
import { runDatabaseTransfer } from './database-transfer-runner';
const port = (
  process as NodeJS.Process & {
    parentPort?: {
      on(event: 'message', listener: (event: { data: DatabaseToWorker }) => void): void;
      postMessage(message: DatabaseFromWorker): void;
    };
  }
).parentPort;
if (!port) throw new Error('Database transfer requires an Electron parent port.');
const parent = port;
const abort = new AbortController();
let started = false;
parent.on('message', ({ data }) => {
  if (data.kind === 'cancel') {
    abort.abort();
    return;
  }
  if (data.kind !== 'start' || started) return;
  started = true;
  void runDatabaseTransfer(data.job, abort.signal, (message) => parent.postMessage(message))
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
});
