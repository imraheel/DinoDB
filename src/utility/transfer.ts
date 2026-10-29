import { MongoClient } from 'mongodb';
import type { TransferFromWorker, TransferToWorker } from '../shared/transfer';
import { buildMongoUri } from '../shared/mongo-uri';
import { runTransfer } from './transfer-runner';

const port = (
  process as NodeJS.Process & {
    parentPort?: {
      on(event: 'message', listener: (event: { data: TransferToWorker }) => void): void;
      postMessage(message: TransferFromWorker): void;
    };
  }
).parentPort;
if (!port) throw new Error('Transfer worker requires an Electron parent port.');
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
  const job = data.job;
  const client = new MongoClient(buildMongoUri(job.connection), {
    appName: 'DinoDB transfer',
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 30000,
    maxPoolSize: 2
  });
  void runTransfer(job, client, abort.signal, (progress) => {
    parent.postMessage({ kind: 'progress', progress });
  })
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
});
