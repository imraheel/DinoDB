// Lite build: the full configuration without the bundled MongoDB tools.
// The app then uses tools installed on the system, or paths chosen in
// Preferences → Database Tools.
//
// Usage: electron-builder --config electron-builder.lite.cjs

const full = require('./electron-builder.cjs');

/** @type {import('electron-builder').Configuration} */
module.exports = {
  ...full,
  beforePack: null,
  afterPack: null,
  // Distinct file names so Lite and full installers can share dist/ and a release.
  artifactName: '${productName}-Lite-${version}-${arch}.${ext}',
  nsis: { ...full.nsis, artifactName: '${productName}-Lite-Setup-${version}.${ext}' },
  mac: { ...full.mac, extraResources: [] },
  win: { ...full.win, extraResources: [] },
  linux: { ...full.linux, extraResources: [] }
};
