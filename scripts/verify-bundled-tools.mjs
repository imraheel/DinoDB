import { open, readFile, readdir, access } from 'node:fs/promises';
import { join } from 'node:path';

export async function verifyArchitecture(file, platform, arch) {
  const handle = await open(file, 'r');
  try {
    const header = Buffer.alloc(4096);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    let machine;
    if (platform === 'darwin' && header.readUInt32LE(0) === 0xfeedfacf)
      machine = header.readUInt32LE(4);
    else if (
      platform === 'linux' &&
      header.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))
    )
      machine = header.readUInt16LE(18);
    else if (platform === 'win32' && header.subarray(0, 2).toString() === 'MZ') {
      const offset = header.readUInt32LE(0x3c);
      if (offset + 6 > bytesRead || header.subarray(offset, offset + 4).toString() !== 'PE\0\0')
        throw new Error('Invalid PE executable.');
      machine = header.readUInt16LE(offset + 4);
    }
    const expected = {
      darwin: { x64: 0x1000007, arm64: 0x100000c },
      linux: { x64: 62, arm64: 183 },
      win32: { x64: 0x8664 }
    }[platform]?.[arch];
    if (!expected || machine !== expected)
      throw new Error(
        `Incorrect executable platform/architecture for ${file}: expected ${platform}-${arch}.`
      );
  } finally {
    await handle.close();
  }
}
export async function verifyBundle(bundle, platform, arch) {
  const manifest = JSON.parse(await readFile(join(bundle, 'manifest.json'), 'utf8'));
  if (manifest.platform !== platform || manifest.arch !== arch)
    throw new Error('Bundled tool manifest does not match installer target.');
  const suffix = platform === 'win32' ? '.exe' : '';
  const expected = ['mongodump', 'mongorestore', 'mongosh'].map((name) => name + suffix).sort();
  const actual = (await readdir(join(bundle, 'bin'))).sort();
  if (JSON.stringify(expected) !== JSON.stringify(actual))
    throw new Error(
      'Bundle must contain exactly the three requested executables; optional crypt_shared libraries must not be redistributed.'
    );
  for (const name of expected) await verifyArchitecture(join(bundle, 'bin', name), platform, arch);
  for (const name of ['databaseTools', 'mongosh']) {
    const notices = await readdir(join(bundle, 'licenses', name));
    if (
      !notices.some((name) => /license/i.test(name)) ||
      !notices.some((name) => /third.*party.*notice/i.test(name))
    )
      throw new Error('Missing bundled license/third-party notices.');
    for (const file of notices) await access(join(bundle, 'licenses', name, file));
  }
}
