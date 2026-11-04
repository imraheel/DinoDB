<p align="center">
  <img src="./src/renderer/public/icon.png" alt="DinoDB app icon" width="96" height="96" />
</p>

<h1 align="center">DinoDB</h1>
<h3 align="center">A fast, native MongoDB client for the desktop.<br />Browse, query, and edit collections with ease.</h3>

<p align="center">
  <img src="./src/renderer/public/screenshot.png" alt="DinoDB welcome screen in light and dark themes" width="100%" />
</p>

## About

DinoDB is a free, open-source MongoDB desktop client for macOS and Windows. It brings connections, queries, document editing, and database tools into a native-feeling interface built with Electron, React, and TypeScript.

Collection tabs run in separate utility processes, so a slow query does not block the rest of the app. Connection profiles and preferences are stored locally in SQLite.

## Highlights

- **Connect your way:** Save multiple MongoDB connections with SCRAM, X.509, AWS, GSSAPI, and PLAIN authentication support.
- **Query with a familiar editor:** Use a Monaco-powered shell-style editor for reads, writes, aggregation, and explain plans.
- **Run full shell scripts:** Choose **Open in Shell** from a collection context menu to open a dedicated Mongosh editor and console, with Run/Stop controls and elapsed status.
- **Explore and edit data:** Browse databases and collections, inspect schema-aware results, and create, update, or delete documents.
- **Move data between systems:** Import and export BSON, Extended JSON, Simple JSON, and CSV, with progress and cancellation controls.
- **Back up and restore databases:** Run `mongodump` and `mongorestore` through the app using bundled [MongoDB Database Tools](https://www.mongodb.com/try/download/database-tools), with optional custom executable paths.
- **Work your way:** Organize tabs and choose light, dark, or system appearance.

## Mongosh and bundled tools

Right-click a collection and choose **Open in Shell** to run full Mongosh scripts in a dedicated editor and console. The tab opens in the selected database. Use `print()` or `printjson()` to display results, **⌘/Ctrl+Enter** to run, and **Stop** to cancel. Each run starts a fresh shell session.

Installers include `mongosh`, `mongodump`, and `mongorestore`, so no separate tool installation is needed. Open **Preferences → Database Tools** to test the tools or select custom executable paths. Custom paths take precedence over bundled tools; installed tools are used when a bundled tool is unavailable.

## Supported platforms

| Platform                            | Release format   |
| ----------------------------------- | ---------------- |
| macOS 12+ (Intel and Apple silicon) | `.dmg`, `.zip`   |
| Windows 10/11 (x64)                 | `.exe` installer |
| Linux                               | Planned          |

## Download

Get DinoDB from [GitHub Releases](https://github.com/imraheel/DinoDB/releases). Choose the macOS `.dmg` or `.zip`, or the Windows `.exe` installer for your system.

## Build from source

You need Node.js 22 and pnpm 10. From a terminal:

```sh
git clone https://github.com/imraheel/DinoDB.git
cd DinoDB
pnpm install --frozen-lockfile
pnpm tools:prepare
pnpm dev
```

To create a production build, run `pnpm build`. To package the app, run `pnpm package:mac` on macOS or `pnpm package:win` on Windows. Packages are written to `dist/`.

`pnpm tools:prepare` downloads and verifies the tools for your system. Initial preparation requires network access and `curl`, plus `unzip` on macOS or `tar` on Windows/Linux. Installer builds prepare the tools automatically for each target platform.

Tool versions and download checksums are listed in [the tool manifest](./scripts/mongodb-tools-manifest.json).

## How to contribute

Bug reports, ideas, documentation, and code contributions are welcome. Search [existing issues](https://github.com/imraheel/DinoDB/issues) before opening a new one, and see [CONTRIBUTING.md](./CONTRIBUTING.md) for setup, project layout, checks, and pull request guidance.

## License

DinoDB is licensed under the [GNU General Public License v3.0](./LICENSE) (`GPL-3.0-only`).

Bundled tools retain their upstream licenses and include third-party notices in the installer.

## DMCA notice

If you believe material in this repository or its GitHub Releases infringes your copyright, follow [GitHub's guide to submitting a DMCA takedown notice](https://docs.github.com/en/site-policy/content-removal-policies/guide-to-submitting-a-dmca-takedown-notice). Identify the copyrighted work and the specific repository or release URLs in your notice. GitHub's guide explains the remaining information required and the counter-notice process.
