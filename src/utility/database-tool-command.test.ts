import { expect, it } from 'vitest';
import type { ConnectionConfig } from '../shared/types';
import type { DatabaseTransferJob } from '../shared/database-transfer';
import { validateDatabase } from '../shared/database-transfer';
import {
  databaseToolArguments,
  redactToolOutput,
  toolConnectionUri
} from './database-tool-command';

const connection: ConnectionConfig = {
  id: 'c',
  name: 'test',
  host: 'localhost',
  port: 27017,
  defaultDatabase: 'authentication',
  username: 'user',
  password: 's3cr@t',
  authSource: '',
  authMechanism: '',
  authMechanismProperties: '',
  extraOptions: '',
  createdAt: 0,
  updatedAt: 0,
  lastConnectedAt: null
};
const job: DatabaseTransferJob = {
  tabId: 'id',
  runId: 'run',
  connection,
  executable: '/tools/mongorestore',
  filePath: '/backup folder/a.archive',
  workDir: '/private/jobs/id',
  input: { kind: 'database-restore', connectionId: 'c', database: 'source' },
  options: {
    kind: 'database-restore',
    sourceDatabase: 'source',
    targetDatabase: 'target',
    inputKind: 'archive',
    gzip: true,
    mode: 'new-database'
  }
};
it('restricts source namespaces and maps a new database without dropping existing data', () => {
  const args = databaseToolArguments(job, '/private/jobs/config.yml', '/output.partial');
  expect(args).toContain('--archive=/backup folder/a.archive');
  expect(args).toEqual(
    expect.arrayContaining([
      '--nsInclude=source.*',
      '--nsFrom=source.*',
      '--nsTo=target.*',
      '--stopOnError',
      '--gzip'
    ])
  );
  expect(args).not.toContain('--drop');
  expect(args.join(' ')).not.toContain(connection.password);
});
it('drops backed-up collections only for replacement and never during dry run', () => {
  const replace: DatabaseTransferJob = {
    ...job,
    options: {
      ...job.options,
      kind: 'database-restore',
      inputKind: 'directory',
      gzip: false,
      sourceDatabase: 'source',
      targetDatabase: 'source',
      mode: 'replace-collections'
    }
  };
  expect(databaseToolArguments(replace, '/config', '/partial')).toContain('--drop');
  expect(databaseToolArguments(replace, '/config', '/partial', true)).toEqual(
    expect.arrayContaining(['--dryRun', '--verbose', '--dir', job.filePath])
  );
  expect(databaseToolArguments(replace, '/config', '/partial', true)).not.toContain('--drop');
});
it('backs up only the chosen database to a temporary compressed archive', () => {
  const backup: DatabaseTransferJob = {
    ...job,
    input: { ...job.input, kind: 'database-backup' },
    options: { kind: 'database-backup', gzip: true }
  };
  expect(databaseToolArguments(backup, '/config', '/partial')).toEqual([
    '--config',
    '/config',
    '--db=source',
    '--archive=/partial',
    '--gzip'
  ]);
});
it('keeps the original authentication database independent from the selected backup database', () => {
  const uri = new URL(toolConnectionUri(connection));
  expect(uri.pathname).toBe('/');
  expect(uri.searchParams.get('authSource')).toBe('authentication');
  expect(
    new URL(toolConnectionUri({ ...connection, authSource: 'admin' })).searchParams.get(
      'authSource'
    )
  ).toBe('admin');
  expect(() => toolConnectionUri({ ...connection, extraOptions: '{"maxPoolSize":10}' })).toThrow(
    'maxPoolSize'
  );
});
it('redacts raw and escaped credentials and whole connection strings, including invalid configuration errors', () => {
  const uri = toolConnectionUri(connection);
  const output = redactToolOutput(
    `${uri} ${connection.password} ${encodeURIComponent(connection.password)}`,
    connection,
    uri
  );
  expect(output).not.toContain(connection.password);
  expect(output).not.toContain('s3cr%40t');
  expect(output).not.toContain('mongodb://');
  expect(
    redactToolOutput('Invalid configuration', { ...connection, extraOptions: '{broken' }, '')
  ).toBe('Invalid configuration');
});
it.each(['admin', 'local', 'config', 'bad.*', 'with space', 'a.b', '', 'x'.repeat(64), '--flag'])(
  'rejects unsafe database names %s',
  (name) => {
    if (name === '--flag') expect(() => validateDatabase(name)).not.toThrow();
    else expect(() => validateDatabase(name)).toThrow();
  }
);
