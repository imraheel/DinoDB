import type { ConnectionConfig } from '../shared/types';
import type { DatabaseTransferJob } from '../shared/database-transfer';
import { validateDatabaseOptions } from '../shared/database-transfer';
import { buildMongoUri } from '../shared/mongo-uri';

export function toolConnectionUri(connection: ConnectionConfig): string {
  const extras = connection.extraOptions.trim()
    ? (JSON.parse(connection.extraOptions) as Record<string, unknown>)
    : {};
  // Driver-only options are not understood by the Database Tools' Go driver.
  const driverOnly = [
    'maxPoolSize',
    'minPoolSize',
    'maxConnecting',
    'waitQueueTimeoutMS',
    'promoteLongs',
    'promoteValues',
    'serverApi',
    'timeoutMS'
  ];
  const unsupported = Object.keys(extras).filter((key) =>
    driverOnly.some((option) => option.toLowerCase() === key.toLowerCase())
  );
  if (unsupported.length)
    throw new Error(
      `Database Tools do not support these connection options: ${unsupported.join(', ')}. Use a separate saved connection without them.`
    );
  const explicitAuth = Object.entries(extras).some(([key]) => key.toLowerCase() === 'authsource');
  const authSource =
    connection.username && !explicitAuth
      ? connection.authSource ||
        (['MONGODB-X509', 'MONGODB-AWS', 'GSSAPI', 'PLAIN'].includes(connection.authMechanism)
          ? '$external'
          : connection.defaultDatabase || 'admin')
      : connection.authSource;
  return buildMongoUri({ ...connection, defaultDatabase: '', authSource });
}
export function databaseToolArguments(
  job: DatabaseTransferJob,
  configPath: string,
  partialPath: string,
  dryRun = false
): string[] {
  validateDatabaseOptions(job.input, job.options);
  if (job.options.kind === 'database-backup') {
    return [
      '--config',
      configPath,
      `--db=${job.input.database}`,
      `--archive=${partialPath}`,
      ...(job.options.gzip ? ['--gzip'] : [])
    ];
  }
  const options = job.options;
  const args = [
    '--config',
    configPath,
    ...(options.inputKind === 'archive' ? [`--archive=${job.filePath}`] : ['--dir', job.filePath]),
    ...(options.gzip ? ['--gzip'] : []),
    `--nsInclude=${options.sourceDatabase}.*`,
    '--stopOnError'
  ];
  if (options.sourceDatabase !== options.targetDatabase)
    args.push(`--nsFrom=${options.sourceDatabase}.*`, `--nsTo=${options.targetDatabase}.*`);
  if (dryRun) args.push('--dryRun', '--verbose');
  else if (options.mode === 'replace-collections') args.push('--drop');
  return args;
}

export function redactToolOutput(text: string, connection: ConnectionConfig, uri: string): string {
  let output = uri ? text.replaceAll(uri, '[connection]') : text;
  const sensitiveValues: string[] = [];
  for (const raw of [connection.extraOptions, connection.authMechanismProperties]) {
    try {
      const parsed: unknown = raw.trim() ? JSON.parse(raw) : {};
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        sensitiveValues.push(
          ...Object.entries(parsed)
            .filter(([key]) => /password|secret|token|credential/i.test(key))
            .map(([, value]) => String(value))
        );
      }
    } catch {
      /* Invalid options are reported without their raw contents. */
    }
  }
  const secrets = [connection.password, ...sensitiveValues];
  for (const secret of secrets.filter(Boolean).sort((a, b) => b.length - a.length)) {
    output = output
      .replaceAll(secret, '[redacted]')
      .replaceAll(encodeURIComponent(secret), '[redacted]');
  }
  output = output.replace(/mongodb(?:\+srv)?:\/\/[^\s"']+/gi, '[connection]');
  return output.replace(/(password|token|secret)\s*[=:]\s*[^\s,;]+/gi, '$1=[redacted]');
}
