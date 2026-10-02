# Live Lib

[![Version](https://vsmarketplacebadges.dev/version-short/gugitgugit.live-lib.svg)](https://marketplace.visualstudio.com/items?itemName=gugitgugit.live-lib)
[![Installs](https://vsmarketplacebadges.dev/installs-short/gugitgugit.live-lib.svg)](https://marketplace.visualstudio.com/items?itemName=gugitgugit.live-lib)
[![License](https://img.shields.io/github/license/team-HotDogAndCoolCat/live-lib)](LICENSE)

**English** | [한국어](README.ko.md)

A VS Code extension for managing npm libraries in your project.

## Features

- **View Library List**: See all project dependencies at a glance
- **View Details**: Check description, version, and homepage information for each library
- **Update Availability**: Compare with the latest version to see which libraries can be updated
- **Update Libraries**: Update to the latest version. Major updates outside your `package.json` range ask for confirmation first and offer the latest version within the range instead
- **Detect Unused Libraries**: Identify libraries that are not actually used in the project
- **Delete Libraries**: Remove unnecessary libraries

## Usage

1. Click the Live Lib icon in the Activity Bar of VS Code.
2. All libraries in your project will be displayed.
3. Click a library to see its details, or use the buttons that appear when you hover over it:
   - **Show Details**: View library information
   - **Update**: Update to the latest version (shown only when a newer version exists)
   - **Delete**: Remove the library
4. Latest versions from the npm registry are cached for 6 hours, even across VS Code restarts. Click the refresh button at the top of the view to check the registry again right away.

## Requirements

- VS Code 1.74 or later
- Node.js project (requires `package.json` file)
- npm, pnpm, yarn or bun. The package manager is detected from the `packageManager` field in `package.json` or from the lockfile, and Update / Delete run the matching command (for example `pnpm add` / `pnpm remove`).

## Extension Settings

| Setting | Default | Description |
| --- | --- | --- |
| `liveLib.packageManager` | `auto` | Package manager used by Update and Delete: `auto`, `npm`, `pnpm`, `yarn` or `bun`. `auto` detects it from the `packageManager` field in `package.json`, then from the lockfile. Set it per project in `.vscode/settings.json` if detection picks the wrong one. |

## Known Issues

- Usage detection looks at `import` / `require` statements, `package.json` scripts and config files. Imports built from variables (for example `require(name)`) cannot be detected.
- A devDependency with no usage found is shown as **not detected** instead of unused, because tools are often used indirectly (for example `webpack-cli` through `webpack`). Check these before removing them.
- The usage scan skips build output folders such as `dist`, `build`, `out` and `coverage` at any depth, plus folders listed in `.gitignore`. Source code kept in a folder with one of those names (for example `src/build/`) is not scanned.

## Feedback

- Found a bug or have an idea? [Open an issue on GitHub](https://github.com/team-HotDogAndCoolCat/live-lib/issues/new).
- If Live Lib saves you time, a [rating on the Marketplace](https://marketplace.visualstudio.com/items?itemName=gugitgugit.live-lib&ssr=false#review-details) helps other developers find it.

## Release Notes

See [CHANGELOG.md](CHANGELOG.md).
