# Change Log

All notable changes to the "Live Lib" extension will be documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- The Marketplace description mentions "libraries" again ("Manage your project's npm libraries in the sidebar…"), and `libraries` and `lib` were added to the keywords. Since 1.0.1 the extension no longer showed up when searching the Marketplace for "library" or "libraries".

## [1.3.1] - 2026-10-03

### Changed

- The interface is now English by default and Korean when VS Code's display language is Korean. Previously command names and messages mixed Korean and English, so some confirmation dialogs (such as Delete and the major update warning) appeared only in Korean.

## [1.3.0] - 2026-10-02

### Added

- `.npmrc` registry support. Latest versions are looked up in the registry set by `registry=` or `@scope:registry=` in `.npmrc` (home folder, then the project up to the repository root, closest wins), including `http://` registries. If a registry does not support `/<package>/latest`, the latest version is read from the version list instead. Credentials such as `_authToken` are never sent.
- The tooltip shows the registry when it is not the public npm registry, and says when the latest version could not be looked up.

### Changed

- Much lighter registry requests. The tree now fetches only each package's latest manifest (`/<package>/latest`, a few KB) instead of its full metadata, which can be over 10 MB for packages like `typescript`. For this extension's own 14 dependencies, data downloaded per refresh dropped from 45.3 MB to about 60 KB.
- The full version list, needed to find the latest version within your range, is fetched only when the major update dialog opens. The tooltip no longer shows that version.
- Registry requests run at most 8 at a time and time out after 10 seconds, so one slow package no longer holds up the whole tree.
- Latest-version lookups are cached for 6 hours and kept across VS Code restarts, so reopening VS Code no longer re-queries the registry for every dependency. The refresh button clears the cache and checks the registry again. Failed lookups and full version lists are not cached.
- The usage scan skips build output and caches (`dist`, `build`, `out`, `coverage`, `.next`, `.nuxt`, `.svelte-kit`, `.vscode-test` and similar), simple folder entries from `.gitignore`, and the `files.exclude` setting. Besides being faster, this stops minified bundles from being read as imports, which could hide an unused dependency.
- Files that have not changed since the last scan are not read again, and files are read in parallel.
- Dependencies that do not come from a registry (`workspace:`, `file:`, `link:`, git URLs, tarball URLs) are no longer looked up.

## [1.2.0] - 2026-10-01

### Added

- pnpm, yarn and bun support. The package manager is detected from the `packageManager` field in `package.json`, then from the lockfile in the project or a parent folder (for monorepo packages). Update and Delete run the matching command, so a pnpm or yarn project no longer gets an unwanted `package-lock.json`. The detected package manager is shown next to each workspace folder.
- `liveLib.packageManager` setting (`auto`, `npm`, `pnpm`, `yarn`, `bun`) to choose the package manager yourself when detection picks the wrong one. It can be set per workspace folder, and the tree refreshes when it changes.

### Changed

- Updating a devDependency now passes the dev flag (for example `npm install --save-dev`), so it always stays in `devDependencies`.
- The Delete confirmation shows the exact command that will run.

## [1.1.0] - 2026-10-01

### Added

- Major update warning. When the latest version is outside the range in `package.json` (for example `^18.0.0` → 19.x, or `^0.2.0` → 0.3.0), the tree shows `(major)` with a warning icon, and Update asks for confirmation first. You can update to the latest version, update to the highest version within the current range instead, or open the package homepage to check the changes.

### Fixed

- The outdated check now uses the version actually installed in `node_modules` instead of the lowest version allowed by the `package.json` range. Previously `^1.2.0` was compared as 1.2.0 even when 1.9.0 was installed. When a package is not installed, the range is still used.
- Version comparison now follows semver rules (via the `semver` package), so prerelease versions such as `2.0.0-beta.1` are ordered correctly.
- Non-version specifiers such as `workspace:*`, `file:`, git URLs and dist-tags are no longer compared.
- Far fewer false "unused" reports. Besides `import` / `require`, usage detection now checks `package.json` scripts (including each package's `bin` names, such as `tsc` for `typescript`), config files (`tsconfig.json`, `eslint.config.*`, `.prettierrc`, strings like `loader: "ts-loader"`), tool config keys in `package.json`, and `@types/*` packages whose target package is used.
- Dynamic `import("x")`, `require.resolve("x")` and sub-path `require("x/sub")` are now detected.

### Changed

- The tooltip and details view show both the installed version and the declared range.
- A devDependency with no usage found is shown as "not detected" instead of "unused", since tools are often used indirectly.
- The README is now split into English (`README.md`) and Korean (`README.ko.md`), with version, install and license badges and a Feedback section.

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
