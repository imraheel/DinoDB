import { MongoClient } from 'mongodb';
import type { InitMessage, MainToUtility, UtilityRequest, UtilityToMain } from '../shared/ipc';
import { buildMongoUri } from '../shared/mongo-uri';
import { executeRequest } from './operations';

type UtilityParentPort = {
  on(event: 'message', listener: (e: { data: unknown }) => void): void;
  postMessage(message: UtilityToMain): void;
};

const rawParentPort = (process as NodeJS.Process & { parentPort?: UtilityParentPort }).parentPort;
if (!rawParentPort) {
  process.exit(1);
}
const parentPort = rawParentPort as UtilityParentPort;

let client: MongoClient | null = null;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function handleInit(init: InitMessage): Promise<void> {
  try {
    const next = new MongoClient(buildMongoUri(init.connection), {
      appName: 'DinoDB',
      serverSelectionTimeoutMS: 10000
    });
    await next.connect();
    client = next;
    parentPort.postMessage({ kind: 'ready' });
  } catch (error) {
    parentPort.postMessage({ kind: 'fatal', error: messageOf(error) });
    process.exit(1);
  }
}

async function handleRequest(
  id: number,
  request: UtilityRequest,
  maxTimeMs: number
): Promise<void> {
  if (!client) {
    parentPort.postMessage({ kind: 'response', id, ok: false, error: 'not connected' });
    return;
  }
  try {
    const result = await executeRequest({ client }, request, maxTimeMs);
    parentPort.postMessage({ kind: 'response', id, ok: true, result });
  } catch (error) {
    parentPort.postMessage({ kind: 'response', id, ok: false, error: messageOf(error) });
  }
}

async function handleMessage(data: unknown): Promise<void> {
  const message = data as MainToUtility;
  if (!message || typeof message !== 'object') return;
  if (message.kind === 'init') {
    await handleInit(message.init);
    return;
  }
  if (message.kind === 'request') {
    await handleRequest(message.id, message.request, message.maxTimeMs);
  }
}

parentPort.on('message', (e) => {
  handleMessage(e.data).catch(() => undefined);
});
