import { execFile } from 'node:child_process';
import * as path from 'node:path';
/** Only call with a PID obtained from an owned child, never a renderer payload. */
export function terminateTool(pid: number, force = false): Promise<void> {
  if (!Number.isSafeInteger(pid) || pid <= 0) return Promise.resolve();
  if (process.platform === 'win32') {
    return new Promise((resolve) => {
      execFile(
        path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe'),
        ['/PID', String(pid), '/T', ...(force ? ['/F'] : [])],
        { windowsHide: true, timeout: 3000 },
        () => resolve()
      );
    });
  }
  try {
    process.kill(-pid, force ? 'SIGKILL' : 'SIGINT');
  } catch {
    try {
      process.kill(pid, force ? 'SIGKILL' : 'SIGINT');
    } catch {
      /* Already exited. */
    }
  }
  return Promise.resolve();
}
