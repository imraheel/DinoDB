export interface ShellContext {
  connectionId: string;
  database: string;
  collection: string;
}
export interface ShellProgress {
  tabId: string;
  state: 'idle' | 'starting' | 'running' | 'cancelling' | 'completed' | 'failed' | 'cancelled';
  output: string;
  truncated: boolean;
  elapsedMs: number;
  exitCode?: number;
  error?: string;
}
export function shellActive(state: ShellProgress['state']): boolean {
  return state === 'starting' || state === 'running' || state === 'cancelling';
}
