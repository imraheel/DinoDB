import { afterEach, describe, expect, it, vi } from 'vitest';
import { chmod, mkdtemp, rm, writeFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseTools, parseToolVersion } from './database-tools';
import { normalizeToolPath } from '../../shared/database-tools';
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'dinodb tools-'));
  dirs.push(dir);
  const file = join(dir, 'mongodump');
  await writeFile(file, 'fixture');
  await chmod(file, 0o755);
  const probe = vi.fn(async (_file: string, args: string[]): Promise<string> =>
    args[0] === '--version' ? 'mongodump version: 100.19.0' : '--config --archive --gzip --db'
  );
  return {
    dir,
    file,
    probe,
    tools: new DatabaseTools({ platform: 'darwin', env: { PATH: dir }, probe })
  };
}
it('resolves installed tools from PATH and keeps absolute paths with spaces', async () => {
  const ctx = await fixture();
  expect(await ctx.tools.resolve('mongodump', '')).toMatchObject({
    available: true,
    source: 'installed',
    version: '100.19.0',
    path: expect.stringContaining('dinodb tools-')
  });
});

it('prefers the bundle over PATH, preserves custom overrides and falls back if the bundle is missing', async () => {
  const bundled = await fixture();
  const installed = await fixture();
  const tools = new DatabaseTools({
    platform: 'darwin',
    env: { PATH: installed.dir },
    probe: bundled.probe,
    bundledDir: bundled.dir
  });
  expect(await tools.resolve('mongodump', '')).toMatchObject({
    source: 'bundled',
    path: await realpath(bundled.file)
  });
  expect(await tools.resolve('mongodump', installed.file)).toMatchObject({
    source: 'custom',
    path: await realpath(installed.file)
  });
  await rm(bundled.file);
  expect(await tools.resolve('mongodump', '')).toMatchObject({
    source: 'installed',
    path: await realpath(installed.file)
  });
  expect((await tools.resolve('mongodump', '/missing/custom')).available).toBe(false);
});

it('validates Mongosh versions and script flags independently of Database Tools versions', async () => {
  const ctx = await fixture();
  const file = join(ctx.dir, 'mongosh');
  await writeFile(file, 'shell');
  await chmod(file, 0o755);
  ctx.probe.mockImplementation(async (_file, args) =>
    args[0] === '--version' ? '2.14.1\n' : '--nodb --norc --file --quiet'
  );
  expect(await ctx.tools.resolve('mongosh', file)).toMatchObject({
    available: true,
    version: '2.14.1'
  });
  expect(() => parseToolVersion('mongosh', '1.10.0')).toThrow();
  expect(() => parseToolVersion('mongosh', 'mongodump version: 100.20.0')).toThrow();
  ctx.probe.mockResolvedValueOnce('2.14.1').mockResolvedValueOnce('--help');
  expect((await ctx.tools.resolve('mongosh', file)).available).toBe(false);
});
it('does not fall back from an invalid explicit override', async () => {
  const ctx = await fixture();
  expect(await ctx.tools.resolve('mongodump', '/missing/mongodump')).toMatchObject({
    available: false,
    source: 'custom'
  });
  expect(ctx.probe).not.toHaveBeenCalled();
});
it('rejects wrong executables, old tools and missing flags', async () => {
  const ctx = await fixture();
  ctx.probe.mockResolvedValueOnce('mongorestore version: 100.19.0');
  expect((await ctx.tools.resolve('mongodump', ctx.file)).available).toBe(false);
  ctx.probe.mockResolvedValueOnce('mongodump version: 100.2.0');
  expect((await ctx.tools.resolve('mongodump', ctx.file)).error).toContain('100.3.0');
  ctx.probe.mockResolvedValueOnce('mongodump version: 100.19.0').mockResolvedValueOnce('--help');
  expect((await ctx.tools.resolve('mongodump', ctx.file)).error).toContain('required');
});
it('reports failed probes without reporting a tool as installed', async () => {
  const ctx = await fixture();
  ctx.probe.mockRejectedValue(new Error('probe timed out'));
  expect(await ctx.tools.resolve('mongodump', ctx.file)).toMatchObject({
    available: false,
    error: expect.stringContaining('timed out')
  });
});
it('builds platform-specific candidates without a login shell', async () => {
  const tools = new DatabaseTools({
    platform: 'win32',
    env: { PATH: 'C:\\Tools;D:\\Mongo Tools' },
    probe: vi.fn()
  });
  expect(await tools.candidates('mongorestore')).toEqual([
    'C:\\Tools\\mongorestore.exe',
    'D:\\Mongo Tools\\mongorestore.exe'
  ]);
});
describe('path/version validation', () => {
  it.each(['relative/tool', 'bad\0path', 'x'.repeat(5000)])(
    'rejects invalid override %s',
    (value) => expect(() => normalizeToolPath(value)).toThrow()
  );
  it('allows automatic detection and absolute paths', () => {
    expect(normalizeToolPath('')).toBe('');
    expect(normalizeToolPath(' /opt/Tools Folder/mongodump ')).toBe('/opt/Tools Folder/mongodump');
    expect(parseToolVersion('mongorestore', 'mongorestore version: 100.3.0')).toBe('100.3.0');
  });
});
it('handles quoted Windows PATH entries and ignores relative search directories', async () => {
  const tools = new DatabaseTools({
    platform: 'win32',
    env: { PATH: '"C:\\Mongo Tools\\bin";.;relative' },
    probe: vi.fn()
  });
  expect(await tools.candidates('mongodump')).toEqual(['C:\\Mongo Tools\\bin\\mongodump.exe']);
});

it('finds standard system and per-user Mongosh installations on Windows without PATH', async () => {
  const tools = new DatabaseTools({
    platform: 'win32',
    env: { ProgramFiles: 'C:\\Program Files', LOCALAPPDATA: 'C:\\Users\\Test\\AppData\\Local' },
    probe: vi.fn()
  });
  expect(await tools.candidates('mongosh')).toContain('C:\\Program Files\\mongosh\\mongosh.exe');
  expect(await tools.candidates('mongosh')).toContain(
    'C:\\Users\\Test\\AppData\\Local\\Programs\\mongosh\\mongosh.exe'
  );
});
