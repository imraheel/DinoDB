import type { InitMessage, MainToUtility, UtilityRequest, UtilityResponses, UtilityToMain } from '../../shared/ipc';

export interface ForkedProcess {
  postMessage(message: MainToUtility): void;
  on(event: 'message', listener: (message: UtilityToMain) => void): void;
  on(event: 'exit', listener: (code: number | null) => void): void;
  kill(): boolean;
}

export interface UtilityClientDeps {
  resolveScriptPath: () => string;
  fork: (scriptPath: string) => ForkedProcess;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface RequestOptions { timeoutMs: number; maxTimeMs: number }

export class UtilityClient {
  private process: ForkedProcess | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();

  constructor(private readonly label: string, private readonly deps: UtilityClientDeps) {}

  async start(init: InitMessage, timeoutMs = 20000): Promise<void> {
    if (this.process) throw new Error(`Utility client "${this.label}" already started`);
    const proc = this.deps.fork(this.deps.resolveScriptPath());
    this.process = proc;

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        proc.kill();
        this.process = null;
        reject(new Error(`Connection timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      const settleStart = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error); else resolve();
      };

      proc.on('message', (message) => {
        if (message.kind === 'ready') settleStart();
        else if (message.kind === 'fatal') { settleStart(new Error(message.error)); this.failAll(new Error(message.error)); }
        else if (message.kind === 'response') {
          const request = this.pending.get(message.id);
          if (!request) return;
          this.pending.delete(message.id);
          clearTimeout(request.timer);
          if (message.ok) request.resolve(message.result);
          else request.reject(new Error(message.error));
        }
      });

      proc.on('exit', (code) => {
        const error = new Error(`Utility process "${this.label}" exited (code ${code ?? 'unknown'})`);
        settleStart(error);
        this.failAll(error);
        this.process = null;
      });

      proc.postMessage({ kind: 'init', init });
    });
  }

  async request<K extends UtilityRequest['kind']>(
    request: Extract<UtilityRequest, { kind: K }>,
    options: RequestOptions
  ): Promise<UtilityResponses[K]> {
    if (!this.process) throw new Error(`Utility client "${this.label}" is not running`);
    const id = this.nextId++;
    const proc = this.process;

    return new Promise<UtilityResponses[K]>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Operation timed out after ${options.timeoutMs}ms`));
      }, options.timeoutMs);

      this.pending.set(id, { resolve: (value) => resolve(value as UtilityResponses[K]), reject, timer });
      proc.postMessage({ kind: 'request', id, request, maxTimeMs: options.maxTimeMs });
    });
  }

  private failAll(error: Error): void {
    for (const [, entry] of this.pending) { clearTimeout(entry.timer); entry.reject(error); }
    this.pending.clear();
  }

  dispose(): void {
    this.process?.kill();
    this.process = null;
    this.failAll(new Error(`Utility client "${this.label}" disposed`));
  }
}
