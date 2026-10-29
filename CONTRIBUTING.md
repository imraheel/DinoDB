# Contributing to DinoDB

Thanks for helping improve DinoDB. Bug reports, feature ideas, documentation fixes, and code changes are all useful.

## Report a problem or suggest a change

Search [existing issues](https://github.com/imraheel/DinoDB/issues) before opening a new one. For a bug, include your operating system, DinoDB version, steps to reproduce, what you expected, and what happened. Screenshots or error messages help; remove connection strings, passwords, and other private data before posting them.

For a larger feature or behavior change, open an issue first so the approach can be discussed before you spend time implementing it.

## Set up for development

Use Node.js 22 and pnpm 10, matching the [release workflow](./.github/workflows/release.yml). Then run:

```sh
git clone https://github.com/imraheel/DinoDB.git
cd DinoDB
pnpm install --frozen-lockfile
pnpm dev
```

You will need a MongoDB server or test connection to exercise connection and query flows in the app. The automated test suite does not require a live MongoDB server.

## Project layout

| Path                               | Purpose                                                           |
| ---------------------------------- | ----------------------------------------------------------------- |
| [`src/main/`](./src/main/)         | Electron startup, windows, local SQLite storage, and IPC handlers |
| [`src/utility/`](./src/utility/)   | Isolated workers for queries and database transfers               |
| [`src/preload/`](./src/preload/)   | Renderer-to-main API bridge                                       |
| [`src/renderer/`](./src/renderer/) | React interface and public assets                                 |
| [`src/shared/`](./src/shared/)     | Types and logic shared across processes                           |
| [`build/`](./build/)               | Application icon and packaging resources                          |

## Check your work

Run these commands before opening a pull request:

```sh
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
```

Add or update tests when behavior changes. Keep documentation and screenshots in sync with changes people will see.

## Open a pull request

Keep the pull request focused. Explain what changed and why, link the relevant issue when there is one, and list the checks you ran. Include before-and-after screenshots for interface changes.

Contributions to this repository are provided under its [GPL-3.0-only license](./LICENSE). If you include third-party code or assets, identify their source and license in the pull request.
