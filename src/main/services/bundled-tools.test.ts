import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The build-time module is JavaScript so the builder can load it before compiling the app.
// @ts-expect-error Build script intentionally has no TypeScript declarations.
import { selectTools, sha256 } from '../../../scripts/prepare-mongodb-tools.mjs';
// @ts-expect-error Build script intentionally has no TypeScript declarations.
import { verifyArchitecture } from '../../../scripts/verify-bundled-tools.mjs';
it('pins matching platform architectures and refuses unsupported universal/Windows ARM builds', () => {
  for (const [platform, arch] of [
    ['darwin', 'x64'],
    ['darwin', 'arm64'],
    ['win32', 'x64'],
    ['linux', 'x64'],
    ['linux', 'arm64']
  ]) {
    const selected = selectTools(platform, arch);
    for (const tool of Object.values(selected) as {
      sha256: string;
      url: string;
      version: string;
    }[]) {
      expect(tool.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(tool.url).toContain(tool.version);
    }
    expect(selected.mongosh.url).toContain(`${platform}-${arch}`);
  }
  expect(() => selectTools('darwin', 'universal')).toThrow('separate');
  expect(() => selectTools('win32', 'arm64')).toThrow();
});
it('hashes actual archive contents rather than trusting cache filenames', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dinodb-bundle-test-'));
  try {
    const file = join(dir, 'archive.zip');
    await writeFile(file, 'verified');
    expect(await sha256(file)).toBe(createHash('sha256').update('verified').digest('hex'));
    await writeFile(file, 'changed');
    expect(await sha256(file)).not.toBe(createHash('sha256').update('verified').digest('hex'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

it('checks executable headers and rejects an architecture or format mismatch', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dinodb-arch-test-'));
  try {
    const file = join(dir, 'mongosh');
    const header = Buffer.alloc(128);
    header.writeUInt32LE(0xfeedfacf, 0);
    header.writeUInt32LE(0x1000007, 4);
    await writeFile(file, header);
    await expect(verifyArchitecture(file, 'darwin', 'x64')).resolves.toBeUndefined();
    await expect(verifyArchitecture(file, 'darwin', 'arm64')).rejects.toThrow('architecture');
    await expect(verifyArchitecture(file, 'win32', 'x64')).rejects.toThrow('architecture');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
