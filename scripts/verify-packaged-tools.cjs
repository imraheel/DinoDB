exports.default = async function afterPack(context) {
  const path = require('node:path');
  const { verifyBundle } = await import('./verify-bundled-tools.mjs');
  const platform = context.electronPlatformName;
  const arch = ['ia32', 'x64', 'armv7l', 'arm64', 'universal'][context.arch];
  const resources =
    platform === 'darwin'
      ? path.join(
          context.appOutDir,
          `${context.packager.appInfo.productFilename}.app`,
          'Contents',
          'Resources'
        )
      : path.join(context.appOutDir, 'resources');
  await verifyBundle(path.join(resources, 'mongodb-tools'), platform, arch);
  console.log(`Verified packaged ${platform}-${arch} tools, architecture and license notices.`);
};
