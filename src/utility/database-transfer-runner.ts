import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm, stat, rename, readdir } from 'node:fs/promises';
import * as path from 'node:path';
import { MongoClient } from 'mongodb';
import type {
  DatabaseTransferJob,
  DatabaseTransferProgress,
  DatabaseFromWorker
} from '../shared/database-transfer';
import {
  databaseToolArguments,
  toolConnectionUri,
  redactToolOutput
} from './database-tool-command';
import { ToolLogDecoder, matchingNamespace } from './database-tool-progress';
import { terminateTool } from '../shared/tool-process';

export async function runDatabaseTransfer(
  job: DatabaseTransferJob,
  signal: AbortSignal,
  send: (message: DatabaseFromWorker) => void,
  deps: { spawn?: typeof spawn; createClient?: (uri: string) => MongoClient } = {}
): Promise<void> {
  const started = Date.now();
  const partial = `${job.filePath}.nexdb-${job.runId}.partial`;
  const configPath = path.join(job.workDir, 'connection.yml');
  let uri = '';
  let lastSent = 0;
  let client: MongoClient | undefined;
  const progress: DatabaseTransferProgress = {
    tabId: job.tabId,
    state: 'checking',
    phase: 'Checking connection',
    elapsedMs: 0,
    activeCollections: [],
    completedCollections: 0,
    logTail: [],
    mayHavePartialChanges: false,
    filePath: job.filePath
  };
  function emit(force = false) {
    if (!force && Date.now() - lastSent < 250) return;
    lastSent = Date.now();
    send({
      kind: 'progress',
      progress: {
        ...progress,
        logTail: [...progress.logTail],
        activeCollections: [...progress.activeCollections],
        elapsedMs: Date.now() - started
      }
    });
  }
  const completed = new Set<string>();
  let matching = false;
  let observedError = false;
  function log(text: string) {
    const safe = redactToolOutput(text, job.connection, uri).slice(0, 4096);
    progress.logTail.push(safe);
    while (
      progress.logTail.length > 200 ||
      progress.logTail.reduce((sum, line) => sum + Buffer.byteLength(line), 0) > 65536
    )
      progress.logTail.shift();
    if (job.options.kind === 'database-restore') {
      const namespace = matchingNamespace(text, job.options.sourceDatabase);
      if (namespace) matching = true;
    }
    const active = safe.match(
      /(?:restoring|writing)\s+(?:indexes for collection\s+)?["'\x60]?([^\s"'\x60]+\.[^\s"'\x60]+)/i
    )?.[1];
    if (active)
      progress.activeCollections = [...new Set([...progress.activeCollections, active])].slice(-8);
    const finished = safe.match(
      /(?:finished restoring|done dumping)\s+["'\x60]?([^\s"'\x60]+\.[^\s"'\x60]+)/i
    )?.[1];
    if (finished) {
      completed.add(finished);
      progress.completedCollections = completed.size;
      progress.activeCollections = progress.activeCollections.filter((item) => item !== finished);
    }
    const documents = safe.match(/(\d+) document\(s\) restored successfully/i);
    if (documents) progress.documents = Number(documents[1]);
    if (
      /Failed:|error restoring|error creating|[1-9]\d* document\(s\) failed|[1-9]\d* failures?\b/i.test(
        safe
      )
    )
      observedError = true;
    emit();
  }
  async function run(args: string[]): Promise<void> {
    signal.throwIfAborted();
    const child = (deps.spawn ?? spawn)(job.executable, args, {
      shell: false,
      windowsHide: true,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let spawnError: Error | undefined;
    const decoders = [new ToolLogDecoder(log), new ToolLogDecoder(log)];
    let force: ReturnType<typeof setTimeout> | undefined;
    const cancel = () => {
      if (child.pid) void terminateTool(child.pid);
      force = setTimeout(() => {
        if (child.pid) void terminateTool(child.pid, true);
      }, 4000);
    };
    child.stdout.on('data', (data: Buffer) => decoders[0].write(data));
    child.stderr.on('data', (data: Buffer) => decoders[1].write(data));
    const closed = new Promise<void>((resolve, reject) => {
      child.once('error', (error) => {
        spawnError = error;
      });
      child.once('close', (code, exitSignal) => {
        signal.removeEventListener('abort', cancel);
        if (force) clearTimeout(force);
        decoders.forEach((decoder) => decoder.finish());
        send({ kind: 'child', pid: null });
        progress.exitCode = code ?? undefined;
        if (spawnError) reject(spawnError);
        else if (signal.aborted) reject(new Error('Operation cancelled.'));
        else if (code !== 0 || exitSignal)
          reject(
            new Error(
              `MongoDB tool stopped (${exitSignal ?? `exit ${code}`}): ${progress.logTail.at(-1) ?? 'No diagnostic output.'}`
            )
          );
        else if (observedError)
          reject(new Error('MongoDB tool reported errors. Review the log for partial results.'));
        else resolve();
      });
    });
    if (child.pid) send({ kind: 'child', pid: child.pid });
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel();
    await closed;
  }
  const heartbeat = setInterval(() => emit(), 250);
  try {
    emit(true);
    signal.throwIfAborted();
    uri = toolConnectionUri(job.connection);
    await mkdir(job.workDir, { recursive: true, mode: 0o700 });
    await writeFile(configPath, `uri: ${JSON.stringify(uri)}\n`, { mode: 0o600, flag: 'wx' });
    client = deps.createClient
      ? deps.createClient(uri)
      : new MongoClient(uri, { serverSelectionTimeoutMS: 10000, connectTimeoutMS: 10000 });
    await client.connect();
    signal.throwIfAborted();
    const options = job.options;
    if (options.kind === 'database-restore') {
      let commandJob = job;
      const info = await stat(job.filePath);
      if ((options.inputKind === 'directory') !== info.isDirectory())
        throw new Error('Select the matching archive file or dump directory input type.');
      if (options.inputKind === 'directory') {
        const entries = await readdir(job.filePath, { withFileTypes: true });
        if (
          entries.some(
            (entry) => entry.isFile() && /\.(?:bson|metadata\.json)(?:\.gz)?$/.test(entry.name)
          )
        ) {
          if (path.basename(job.filePath) !== options.sourceDatabase)
            throw new Error(
              'A database dump directory must have the original database name. Select the dump root or correct the source name.'
            );
          commandJob = { ...job, filePath: path.dirname(job.filePath) };
        }
      }
      if (options.mode === 'new-database') {
        const existing = await client
          .db()
          .admin()
          .listDatabases({
            nameOnly: true,
            filter: { name: options.targetDatabase },
            timeoutMS: 10000
          });
        if (existing.databases.length)
          throw new Error(
            'The target database already exists. Choose a new name or explicitly select an existing-database restore mode.'
          );
      }
      progress.phase = 'Checking backup namespaces';
      emit(true);
      await run(databaseToolArguments(commandJob, configPath, partial, true));
      signal.throwIfAborted();
      if (!matching)
        throw new Error(
          'No verified collection/view matches the source database in this backup. Check the source database name, input directory and tool version. No restore was started.'
        );
      if (options.mode === 'new-database') {
        const existing = await client
          .db()
          .admin()
          .listDatabases({
            nameOnly: true,
            filter: { name: options.targetDatabase },
            timeoutMS: 10000
          });
        if (existing.databases.length)
          throw new Error(
            'The target database was created during preflight. Choose a different name.'
          );
      }
      progress.state = 'running';
      progress.phase = 'Restoring database';
      progress.mayHavePartialChanges = true;
      progress.exitCode = undefined;
      progress.activeCollections = [];
      completed.clear();
      progress.completedCollections = 0;
      emit(true);
      await run(databaseToolArguments(commandJob, configPath, partial));
    } else {
      progress.state = 'running';
      progress.phase = 'Backing up database';
      emit(true);
      await run(databaseToolArguments(job, configPath, partial));
      signal.throwIfAborted();
      const output = await stat(partial);
      if (!output.isFile() || output.size === 0)
        throw new Error('The tool did not produce a valid archive file.');
      progress.bytes = output.size;
      await rename(partial, job.filePath);
    }
    progress.state = 'completed';
    progress.phase = 'Completed';
    progress.activeCollections = [];
  } catch (error) {
    progress.state = signal.aborted ? 'cancelled' : 'failed';
    progress.phase = signal.aborted ? 'Cancelled' : 'Failed';
    progress.error = redactToolOutput(
      error instanceof Error ? error.message : String(error),
      job.connection,
      uri
    );
  } finally {
    await client?.close().catch(() => {});
    await rm(job.workDir, { recursive: true, force: true }).catch(() => {});
    if (job.input.kind === 'database-backup') await rm(partial, { force: true }).catch(() => {});
    clearInterval(heartbeat);
    emit(true);
  }
}
