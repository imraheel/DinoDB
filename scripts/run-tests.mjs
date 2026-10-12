import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import electronPath from 'electron';

const require = createRequire(import.meta.url);
const pkgPath = require.resolve('vitest/package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin.vitest;
const entry = join(dirname(pkgPath), bin);

const result = spawnSync(electronPath, [entry, 'run', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
});
process.exit(result.status ?? 1);
