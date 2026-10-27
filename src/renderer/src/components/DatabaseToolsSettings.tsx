import { useEffect, useState } from 'react';
import type {
  DatabaseToolName,
  DatabaseToolsPaths,
  DatabaseToolsStatus
} from '../../../shared/database-tools';
import { messageOf } from '../lib/errors';
import { TextInput } from './ui/Input';
import Button from './ui/Button';

export default function DatabaseToolsSettings({
  paths,
  onChange
}: {
  paths: DatabaseToolsPaths;
  onChange(paths: Partial<DatabaseToolsPaths>): void;
}) {
  const [status, setStatus] = useState<DatabaseToolsStatus | null>(null);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setStatus(null);
  }, [paths.mongodumpPath, paths.mongorestorePath]);
  async function test() {
    setTesting(true);
    setError(null);
    try {
      setStatus(await window.api.testDatabaseTools(paths));
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setTesting(false);
    }
  }
  async function browse(name: DatabaseToolName) {
    try {
      const selected = await window.api.browseDatabaseTool(name);
      if (selected)
        onChange(
          name === 'mongodump' ? { mongodumpPath: selected } : { mongorestorePath: selected }
        );
    } catch (err) {
      setError(messageOf(err));
    }
  }
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-ui font-semibold text-label">MongoDB Database Tools</h3>
        <p className="mt-2 text-xs text-label-secondary">
          Use installed tools automatically or select executables. Database Tools 100.3.0 or later
          is required. Changes take effect after saving Preferences.
        </p>
      </div>
      {(['mongodump', 'mongorestore'] as const).map((name) => {
        const key = name === 'mongodump' ? 'mongodumpPath' : 'mongorestorePath';
        const result = status?.[name];
        return (
          <div key={name} className="space-y-2">
            <label className="block text-xs font-medium text-label" htmlFor={`tool-${name}`}>
              {name}
            </label>
            <TextInput
              id={`tool-${name}`}
              value={paths[key]}
              placeholder="Automatic detection"
              disabled={testing}
              onChange={(event) => onChange({ [key]: event.target.value })}
              className="w-full"
            />
            <div className="flex gap-2">
              <Button disabled={testing} onClick={() => void browse(name)}>
                Browse…
              </Button>
              <Button disabled={testing || !paths[key]} onClick={() => onChange({ [key]: '' })}>
                Reset to automatic
              </Button>
            </div>
            {result ? (
              <div className="break-all text-xs" aria-live="polite">
                <p className={result.available ? 'text-success' : 'text-danger'}>
                  {result.available
                    ? `${result.version} · ${result.source === 'custom' ? 'User selected' : 'Installed'}`
                    : result.error}
                </p>
                {result.path ? <p className="mt-1 text-label-tertiary">{result.path}</p> : null}
              </div>
            ) : null}
          </div>
        );
      })}
      <Button disabled={testing} onClick={() => void test()}>
        {testing ? 'Testing…' : 'Test tools'}
      </Button>
      <p className="text-xs text-label-tertiary">
        Testing checks the executables and supported options without connecting to a database. No
        tools are bundled or installed automatically.
      </p>
      <a
        href="https://www.mongodb.com/try/download/database-tools"
        target="_blank"
        rel="noreferrer"
        className="text-xs text-accent underline"
      >
        MongoDB Database Tools downloads
      </a>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
