import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { buildMongoUri } from '../../shared/mongo-uri';
import type { ConnectionConfig } from '../../shared/types';
import type { ShellProgress } from '../../shared/shell';
import { terminateTool } from '../../shared/tool-process';
import { redactToolOutput } from '../../utility/database-tool-command';
import { ToolLogDecoder } from '../../utility/database-tool-progress';

export interface ShellRun {
  tabId: string;
  executable: string;
  connection: ConnectionConfig;
  database: string;
  script: string;
  tempRoot: string;
  timeoutMs: number;
}

/** Credentials stay in a private file, never in process arguments. */
export function shellBootstrap(uri: string, database: string, scriptPath: string): string {
  return `db = connect(${JSON.stringify(uri)});\ndb = db.getSiblingDB(${JSON.stringify(database)});\nload(${JSON.stringify(scriptPath)});\n`;
}

export async function runShell(
  job: ShellRun,
  signal: AbortSignal,
  send: (progress: ShellProgress) => void,
  spawnChild: typeof spawn = spawn
): Promise<void> {
  const start = Date.now();
  const progress: ShellProgress = {
    tabId: job.tabId,
    state: 'starting',
    output: '',
    truncated: false,
    elapsedMs: 0
  };
  let dir: string | undefined;
  let uri = '';
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let force: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const emit = () => send({ ...progress, elapsedMs: Date.now() - start });
  const heartbeat = setInterval(emit, 200);
  const append = (line: string) => {
    progress.output += `${redactToolOutput(line, job.connection, uri)}\n`;
    // Bounded UTF-16 console tail; no HTML/ANSI interpretation in the renderer.
    if (progress.output.length > 64000) {
      progress.output = progress.output.slice(-64000);
      progress.truncated = true;
    }
  };
  try {
    signal.throwIfAborted();
    uri = buildMongoUri(job.connection);
    dir = await mkdtemp(join(job.tempRoot, 'dinodb-shell-'));
    await chmod(dir, 0o700);
    const script = join(dir, 'script.js');
    const bootstrap = join(dir, 'bootstrap.js');
    await writeFile(script, job.script, { mode: 0o600, flag: 'wx' });
    await writeFile(bootstrap, shellBootstrap(uri, job.database, script), {
      mode: 0o600,
      flag: 'wx'
    });
    signal.throwIfAborted();
    const child = spawnChild(job.executable, ['--nodb', '--norc', '--quiet', '--file', bootstrap], {
      shell: false,
      windowsHide: true,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NO_COLOR: '1',
        TERM: 'dumb',
        MONGOSH_FORCE_DISABLE_TELEMETRY_FOR_TESTING: '1'
      }
    });
    const stop = () => {
      progress.state = 'cancelling';
      emit();
      if (child.pid) void terminateTool(child.pid);
      if (!force)
        force = setTimeout(() => {
          if (child.pid) void terminateTool(child.pid, true);
        }, 4000);
    };
    const decoders = [new ToolLogDecoder(append), new ToolLogDecoder(append)];
    child.stdout.on('data', (data: Buffer) => decoders[0].write(data));
    child.stderr.on('data', (data: Buffer) => decoders[1].write(data));
    let spawnError: Error | undefined;
    const closed = new Promise<void>((resolve, reject) => {
      child.once('error', (error) => {
        spawnError = error;
      });
      child.once('close', (code, exitSignal) => {
        signal.removeEventListener('abort', stop);
        if (timeout) clearTimeout(timeout);
        if (force) clearTimeout(force);
        decoders.forEach((decoder) => decoder.finish());
        progress.exitCode = code ?? undefined;
        if (spawnError) reject(spawnError);
        else if (timedOut)
          reject(
            new Error(
              'Script exceeded the configured query timeout. Database writes already applied are not rolled back.'
            )
          );
        else if (signal.aborted)
          reject(new Error('Script stopped. Database writes already applied are not rolled back.'));
        else if (code !== 0 || exitSignal)
          reject(
            new Error(
              `Mongosh stopped (${exitSignal ?? `exit ${code}`}). Review the console output.`
            )
          );
        else resolve();
      });
    });
    signal.addEventListener('abort', stop, { once: true });
    progress.state = 'running';
    emit();
    timeout = setTimeout(() => {
      timedOut = true;
      stop();
    }, job.timeoutMs);
    if (signal.aborted) stop();
    await closed;
    progress.state = 'completed';
  } catch (error) {
    progress.state = signal.aborted ? 'cancelled' : 'failed';
    progress.error = redactToolOutput(
      error instanceof Error ? error.message : String(error),
      job.connection,
      uri
    );
  } finally {
    clearInterval(heartbeat);
    if (timeout) clearTimeout(timeout);
    if (force) clearTimeout(force);
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
    emit();
  }
}
