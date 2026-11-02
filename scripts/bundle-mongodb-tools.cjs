exports.default = async function beforePack(context) {
  const { prepareTools } = await import('./prepare-mongodb-tools.mjs');
  const arch = ['ia32', 'x64', 'armv7l', 'arm64', 'universal'][context.arch];
  await prepareTools(context.electronPlatformName, arch, context.packager.projectDir);
};
