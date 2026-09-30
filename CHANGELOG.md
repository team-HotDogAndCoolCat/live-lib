# Change Log

All notable changes to the "Live Lib" extension will be documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/).

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
