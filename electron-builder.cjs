// Full build: bundles mongosh, mongodump and mongorestore into the app.
// For a build without them, see electron-builder.lite.cjs.

/** @param {string} platform */
function bundledTools(platform) {
  return [{ from: `.cache/mongodb-tools/${platform}-\${arch}/mongodb-tools`, to: 'mongodb-tools' }];
}

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'com.dinodb.app',
  productName: 'DinoDB',
  directories: {
    output: 'dist',
    buildResources: 'build'
  },
  files: [
    'out/**/*',
    'build/icon.png',
    'build/icon.ico',
    '!src/**/*',
    '!docs/**/*',
    '!scripts/**/*',
    '!electron.vite.config.mts',
    '!tsconfig*.json',
    '!vitest.config.ts'
  ],
  asar: true,
  asarUnpack: ['node_modules/better-sqlite3/**/*', 'build/icon.png', 'build/icon.ico'],
  npmRebuild: false,
  // Downloads and verifies the tools into .cache/mongodb-tools before packaging...
  beforePack: 'scripts/bundle-mongodb-tools.cjs',
  // ...and checks they made it into the packaged app.
  afterPack: 'scripts/verify-packaged-tools.cjs',
  mac: {
    extraResources: bundledTools('darwin'),
    icon: 'build/icon.icns',
    target: ['dmg', 'zip'],
    category: 'public.app-category.developer-tools',
    identity: null
  },
  win: {
    extraResources: bundledTools('win32'),
    icon: 'build/icon.ico',
    target: [{ target: 'nsis', arch: ['x64'] }]
  },
  linux: {
    extraResources: bundledTools('linux'),
    icon: 'build/icon.png',
    target: ['AppImage', 'deb'],
    category: 'Development'
  }
};
