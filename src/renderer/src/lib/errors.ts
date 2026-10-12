const IPC_ERROR_PREFIX = /^Error invoking remote method '[^']+': Error: /;

export function messageOf(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(IPC_ERROR_PREFIX, '');
}
