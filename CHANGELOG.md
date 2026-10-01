# Change Log

All notable changes to the "Live Lib" extension will be documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed

- The outdated check now uses the version actually installed in `node_modules` instead of the lowest version allowed by the `package.json` range. Previously `^1.2.0` was compared as 1.2.0 even when 1.9.0 was installed. When a package is not installed, the range is still used.
- Version comparison now follows semver rules (via the `semver` package), so prerelease versions such as `2.0.0-beta.1` are ordered correctly.
- Non-version specifiers such as `workspace:*`, `file:`, git URLs and dist-tags are no longer compared.
- Far fewer false "unused" reports. Besides `import` / `require`, usage detection now checks `package.json` scripts (including each package's `bin` names, such as `tsc` for `typescript`), config files (`tsconfig.json`, `eslint.config.*`, `.prettierrc`, strings like `loader: "ts-loader"`), tool config keys in `package.json`, and `@types/*` packages whose target package is used.
- Dynamic `import("x")`, `require.resolve("x")` and sub-path `require("x/sub")` are now detected.

### Changed

- The tooltip and details view show both the installed version and the declared range.
- A devDependency with no usage found is shown as "not detected" instead of "unused", since tools are often used indirectly.
- Added a Feedback section to the README.

## [1.0.1] - 2026-09-30

### Security

- Update and Delete no longer run a terminal command when the package name or version contains characters outside the npm naming rules. A crafted `package.json` key such as `"foo; rm -rf ~"` could previously execute arbitrary shell commands.

### Changed

- Minimum VS Code version lowered from 1.106.1 to 1.74.0, so the extension can be installed on older VS Code releases and VS Code-based editors.
- Delete now relies on `npm uninstall` alone instead of rewriting `package.json` first, which preserves the file's original indentation.
- Added marketplace keywords and categories.

### Removed

- Debug `console.log` output on every registry lookup.

## [1.0.0] - 2025-12-02

### Added

- Dependency tree for each workspace folder's `package.json` (`dependencies` and `devDependencies`)
- Latest-version check against the npm registry, with outdated packages marked
- Unused dependency detection based on `import` / `require` statements
- Library details (description, homepage)
- Update to the latest version and delete actions
