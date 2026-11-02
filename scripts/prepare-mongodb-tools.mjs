import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  access,
  chmod,
  cp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile
} from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyBundle } from './verify-bundled-tools.mjs';

const execute = promisify(execFile);
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const manifest = JSON.parse(
  await readFile(new URL('./mongodb-tools-manifest.json', import.meta.url), 'utf8')
);
export async function sha256(file) {
  const hash = createHash('sha256');
  for await (const data of createReadStream(file)) hash.update(data);
  return hash.digest('hex');
}
export function selectTools(platform, arch) {
  const selected = manifest.platforms[`${platform}-${arch}`];
  if (!selected)
    throw new Error(
      `Bundled MongoDB tools do not support ${platform}-${arch}. Build separate x64/arm64 installers rather than a universal installer.`
    );
  for (const artifact of Object.values(selected)) {
    if (!/^[a-f0-9]{64}$/.test(artifact.sha256) || !artifact.url.startsWith('https://'))
      throw new Error('Invalid pinned tool manifest.');
  }
  return selected;
}
async function archiveFor(artifact, cache) {
  const target = join(cache, basename(new URL(artifact.url).pathname));
  if ((await sha256(target).catch(() => '')) === artifact.sha256) return target;
  const temporary = `${target}.${randomUUID()}.partial`;
  console.log(`Downloading ${basename(target)} (SHA-256 verified)`);
  try {
    await execute(
      'curl',
      [
        '-4',
        '--fail',
        '--location',
        '--proto',
        '=https',
        '--proto-redir',
        '=https',
        '--retry',
        '2',
        '--connect-timeout',
        '15',
        '--max-time',
        '300',
        '--output',
        temporary,
        artifact.url
      ],
      { timeout: 950000, maxBuffer: 1024 * 1024, windowsHide: true }
    );
    if ((await sha256(temporary)) !== artifact.sha256)
      throw new Error(
        `SHA-256 mismatch for ${basename(target)}. Refusing to package unverified tools.`
      );
    await rm(target, { force: true });
    await rename(temporary, target);
    return target;
  } finally {
    await rm(temporary, { force: true });
  }
}
async function unpack(archive, directory) {
  await mkdir(directory, { recursive: true });
  if (archive.endsWith('.zip') && process.platform !== 'win32') {
    await execute('unzip', ['-q', archive, '-d', directory], { timeout: 120000 });
  } else {
    // Windows ships bsdtar, which understands zip as well as tar archives.
    await execute('tar', ['-xf', archive, '-C', directory], { timeout: 120000 });
  }
  const roots = (await readdir(directory, { withFileTypes: true })).filter(
    (entry) => entry.isDirectory() && entry.name !== '__MACOSX'
  );
  if (roots.length !== 1) throw new Error(`Unexpected archive layout: ${basename(archive)}`);
  return join(directory, roots[0].name);
}
async function copyNotices(root, destination) {
  const notices = (await readdir(root)).filter(
    (name) =>
      !name.startsWith('._') &&
      /license|notice|copyright/i.test(name) &&
      !/crypt-library/i.test(name)
  );
  if (!notices.some((name) => /license/i.test(name)))
    throw new Error('Upstream archive is missing its license.');
  if (!notices.some((name) => /third.*party.*notice/i.test(name)))
    throw new Error('Upstream archive is missing third-party notices.');
  await mkdir(destination, { recursive: true });
  for (const name of notices)
    await cp(join(root, name), join(destination, name), { recursive: true });
}
export async function prepareTools(
  platform = process.platform,
  arch = process.arch,
  root = projectRoot
) {
  const selected = selectTools(platform, arch);
  const cache = join(root, '.cache', 'mongodb-tools');
  await mkdir(cache, { recursive: true });
  const staging = join(cache, `staging-${platform}-${arch}-${randomUUID()}`);
  const destination = join(cache, `${platform}-${arch}`, 'mongodb-tools');
  const bundle = join(staging, 'bundle');
  try {
    await mkdir(join(bundle, 'bin'), { recursive: true });
    for (const [name, artifact] of Object.entries(selected)) {
      const archive = await archiveFor(artifact, cache);
      const extracted = await unpack(archive, join(staging, name));
      await copyNotices(extracted, join(bundle, 'licenses', name));
      const extension = platform === 'win32' ? '.exe' : '';
      if (name === 'databaseTools') {
        for (const tool of ['mongodump', 'mongorestore'])
          await cp(join(extracted, 'bin', tool + extension), join(bundle, 'bin', tool + extension));
      } else {
        // The standalone executable embeds its Node runtime. The sibling crypt_shared
        // library is optional, separately licensed, and deliberately not redistributed.
        await cp(
          join(extracted, 'bin', 'mongosh' + extension),
          join(bundle, 'bin', 'mongosh' + extension)
        );
      }
    }
    for (const tool of ['mongodump', 'mongorestore', 'mongosh']) {
      const executable = join(bundle, 'bin', tool + (platform === 'win32' ? '.exe' : ''));
      await access(executable);
      if (platform !== 'win32') await chmod(executable, 0o755);
    }
    await writeFile(
      join(bundle, 'manifest.json'),
      JSON.stringify({ platform, arch, tools: selected }, null, 2) + '\n'
    );
    await verifyBundle(bundle, platform, arch);
    await mkdir(dirname(destination), { recursive: true });
    await rm(destination, { recursive: true, force: true });
    await rename(bundle, destination);
    console.log(`Prepared ${platform}-${arch} tools: ${destination}`);
    return destination;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await prepareTools(process.argv[2] ?? process.platform, process.argv[3] ?? process.arch);
}
