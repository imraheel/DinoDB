import { execFile } from 'node:child_process';
import { access, realpath, stat, readdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import * as path from 'node:path';
import type {
  DatabaseToolName,
  DatabaseToolsPaths,
  DatabaseToolsStatus,
  DatabaseToolStatus
} from '../../shared/database-tools';
import { normalizeToolPath } from '../../shared/database-tools';

export interface ToolProbeDeps {
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  bundledDir?: string;
  probe(file: string, args: string[]): Promise<string>;
}
export function probeExecutable(file: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      { timeout: 5000, maxBuffer: 256 * 1024, windowsHide: true, shell: false },
      (error, stdout, stderr) => {
        if (error)
          reject(
            new Error(
              `Unable to run ${path.basename(file)}: ${error.killed ? 'probe timed out' : (error.code ?? 'execution failed')}.`
            )
          );
        else resolve(`${stdout}\n${stderr}`);
      }
    );
  });
}
export function parseToolVersion(name: DatabaseToolName, output: string): string {
  if (name === 'mongosh') {
    const match = output.trim().match(/^(?:mongosh\s+(?:version:\s*)?v?)?(\d+)\.(\d+)\.(\d+)\s*$/i);
    if (!match || Number(match[1]) < 2) throw new Error('Mongosh 2.0.0 or later is required.');
    return match.slice(1).join('.');
  }
  const match = output.match(
    new RegExp(`(?:^|\\n)${name} version:\\s*(?:v)?(\\d+)\\.(\\d+)\\.(\\d+)`, 'i')
  );
  if (!match) throw new Error(`The selected executable did not identify itself as ${name}.`);
  const [, major, minor, patch] = match;
  if (Number(major) < 100 || (Number(major) === 100 && Number(minor) < 3)) {
    throw new Error('MongoDB Database Tools 100.3.0 or later is required.');
  }
  return `${major}.${minor}.${patch}`;
}
export class DatabaseTools {
  constructor(
    private readonly deps: ToolProbeDeps = {
      platform: process.platform,
      env: process.env,
      probe: probeExecutable
    }
  ) {}
  async candidates(name: DatabaseToolName): Promise<string[]> {
    const win = this.deps.platform === 'win32';
    const paths = this.deps.env.PATH ?? this.deps.env.Path ?? '';
    const dirs = paths
      .split(win ? ';' : ':')
      .map((dir) => dir.trim().replace(/^"(.*)"$/, '$1'))
      .filter((dir) => (win ? path.win32 : path).isAbsolute(dir));
    if (win) {
      for (const root of [this.deps.env.ProgramFiles, this.deps.env['ProgramFiles(x86)']].filter(
        (value): value is string => Boolean(value)
      )) {
        if (name === 'mongosh') {
          dirs.push(path.win32.join(root, 'mongosh'), path.win32.join(root, 'mongosh', 'bin'));
          continue;
        }
        const base = path.win32.join(root, 'MongoDB', 'Tools');
        const versions = await readdir(base).catch(() => []);
        versions.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
        dirs.push(...versions.map((version) => path.win32.join(base, version, 'bin')));
      }
      if (name === 'mongosh' && this.deps.env.LOCALAPPDATA) {
        const base = path.win32.join(this.deps.env.LOCALAPPDATA, 'Programs', 'mongosh');
        dirs.push(base, path.win32.join(base, 'bin'));
      }
    } else {
      dirs.push(
        ...(this.deps.platform === 'darwin'
          ? ['/opt/homebrew/bin', '/usr/local/bin', '/opt/local/bin', '/usr/bin']
          : ['/usr/local/bin', '/usr/bin'])
      );
    }
    const join = win ? path.win32.join : path.join;
    return [...new Set(dirs.map((dir) => join(dir, name + (win ? '.exe' : ''))))];
  }
  async resolve(name: DatabaseToolName, custom: string): Promise<DatabaseToolStatus> {
    let selected: string;
    try {
      selected = normalizeToolPath(custom);
    } catch (error) {
      return {
        name,
        source: 'custom',
        path: null,
        version: null,
        available: false,
        error: String(error instanceof Error ? error.message : error)
      };
    }
    const bundled = this.deps.bundledDir
      ? path.join(this.deps.bundledDir, name + (this.deps.platform === 'win32' ? '.exe' : ''))
      : undefined;
    const candidates = selected
      ? [selected]
      : [...(bundled ? [bundled] : []), ...(await this.candidates(name))];
    let lastError = `${name} was not found. Install ${name === 'mongosh' ? 'MongoDB Shell' : 'MongoDB Database Tools'} or choose its executable in Preferences.`;
    const seen = new Set<string>();
    for (const candidate of candidates) {
      try {
        const executable = await realpath(candidate);
        if (seen.has(executable)) continue;
        seen.add(executable);
        if (this.deps.platform === 'win32' && !executable.toLowerCase().endsWith('.exe'))
          throw new Error('Choose a native .exe executable.');
        if (!(await stat(executable)).isFile()) throw new Error('The selected path is not a file.');
        await access(executable, this.deps.platform === 'win32' ? constants.F_OK : constants.X_OK);
        const version = parseToolVersion(name, await this.deps.probe(executable, ['--version']));
        const help = await this.deps.probe(executable, ['--help']);
        const flags =
          name === 'mongosh'
            ? ['--nodb', '--norc', '--file', '--quiet']
            : name === 'mongodump'
              ? ['--config', '--archive', '--gzip', '--db']
              : [
                  '--config',
                  '--archive',
                  '--gzip',
                  '--nsInclude',
                  '--nsFrom',
                  '--nsTo',
                  '--dryRun',
                  '--stopOnError',
                  '--drop'
                ];
        if (flags.some((flag) => !help.includes(flag)))
          throw new Error(`${name} does not support all required backup/restore options.`);
        return {
          name,
          source: selected ? 'custom' : candidate === bundled ? 'bundled' : 'installed',
          path: executable,
          version,
          available: true
        };
      } catch (error) {
        if (selected)
          lastError = `Cannot use ${name}: ${error instanceof Error ? error.message : String(error)}`;
        else if (seen.size > 0)
          lastError = `No usable ${name} found. ${error instanceof Error ? error.message : String(error)}`;
      }
    }
    return {
      name,
      source: selected ? 'custom' : 'missing',
      path: selected || null,
      version: null,
      available: false,
      error: lastError
    };
  }
  async test(paths: DatabaseToolsPaths): Promise<DatabaseToolsStatus> {
    const [mongodump, mongorestore, mongosh] = await Promise.all([
      this.resolve('mongodump', paths.mongodumpPath),
      this.resolve('mongorestore', paths.mongorestorePath),
      this.resolve('mongosh', paths.mongoshPath)
    ]);
    return { mongodump, mongorestore, mongosh };
  }
}
