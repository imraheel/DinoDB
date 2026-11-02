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

Right-click a collection and select **Open in Shell**. The tab starts in that collection's database and includes an editable example. Each **Run script** starts a fresh Mongosh process; variables remain available throughout that script, and are reset between runs. Use `print()` or `printjson()` to send results to the selectable console. Run with **⌘/Ctrl+Enter**, stop with **Stop**, and configure the execution timeout in Preferences → Advance Settings. Console output is bounded; earlier output is truncated when necessary. Shell scripts run locally with your OS permissions and can read files and perform database writes. Stopping a process does not roll back database writes or guarantee immediate cancellation of server-side work.

Normal collection browsing, document editing, indexes and exports continue to use the MongoDB driver. Shell tabs run independently and are stopped when closed, disconnected, or when the app quits. Connection credentials are supplied through private temporary bootstrap files rather than process arguments, and sensitive saved connection values are redacted from console output.

Installers include `mongodump`, `mongorestore` and `mongosh` for their target platform and architecture. Preferences → Database Tools supports independent **Browse**, **Test tools**, and **Reset to automatic** controls for all three. Automatic selection tries bundled executables before PATH/common installation locations; an explicit custom path takes precedence and is reported as invalid without silently substituting another tool. No tools are downloaded by the running application.

Database Tools are pinned to **100.20.0**. Mongosh is pinned to **2.5.10 on macOS** to retain macOS 12 compatibility, and **2.14.1 on Windows/Linux**. Newer Mongosh builds can require a newer OS runtime; compatible custom executables may also be selected. Upstream license and third-party notices are shipped under the installed `mongodb-tools/licenses` directory. The optional, separately licensed `mongosh_crypt_v1` encryption library is excluded; features requiring that library are not provided by the bundle.

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

`pnpm tools:prepare` downloads the pinned native tool archives, verifies SHA-256 hashes, and stages executables and notices in the ignored `.cache/mongodb-tools` directory. To prepare another target, use e.g. `pnpm tools:prepare darwin arm64` or `pnpm tools:prepare win32 x64`. The installer build hook performs this step automatically for each target, including the existing release workflow. Initial preparation requires network access and `curl`, plus `unzip` on macOS or `tar` on Windows/Linux. Cached archives are rechecked before reuse. The build verifies executable architecture and refuses missing licenses, checksums or unexpected bundled binaries. macOS x64 and arm64 installers are built separately; a universal installer is not supported by this tool bundle. Linux tool preparation targets Ubuntu 22.04-compatible systems; Linux app releases remain planned.

Tool versions, official source URLs and pinned hashes are recorded in [the tool manifest](./scripts/mongodb-tools-manifest.json). Updating a bundled release requires updating and validating its hash, binary compatibility and license notices together.

Local macOS Intel DMG measurements for the bundling experiment (2026-11-03, same application build, unsigned):

| Installer | Size |
| --- | ---: |
| Without tools | 147.9 MiB |
| With all three tools | 213.2 MiB |
| Increase | 65.3 MiB (44.2%) |

These measurements apply to the macOS x64 DMG; other architectures, formats and tool versions will differ.

## How to contribute

Bug reports, ideas, documentation, and code contributions are welcome. Search [existing issues](https://github.com/imraheel/DinoDB/issues) before opening a new one, and see [CONTRIBUTING.md](./CONTRIBUTING.md) for setup, project layout, checks, and pull request guidance.

## License

DinoDB is licensed under the [GNU General Public License v3.0](./LICENSE) (`GPL-3.0-only`).

## DMCA notice

If you believe material in this repository or its GitHub Releases infringes your copyright, follow [GitHub's guide to submitting a DMCA takedown notice](https://docs.github.com/en/site-policy/content-removal-policies/guide-to-submitting-a-dmca-takedown-notice). Identify the copyrighted work and the specific repository or release URLs in your notice. GitHub's guide explains the remaining information required and the counter-notice process.
