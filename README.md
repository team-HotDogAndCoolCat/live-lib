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
- **Update Libraries**: Update to the latest version
- **Detect Unused Libraries**: Identify libraries that are not actually used in the project
- **Delete Libraries**: Remove unnecessary libraries

## Usage

1. Click the Live Lib icon in the Activity Bar of VS Code.
2. All libraries in your project will be displayed.
3. Click a library to see its details, or use the buttons that appear when you hover over it:
   - **Show Details**: View library information
   - **Update**: Update to the latest version (shown only when a newer version exists)
   - **Delete**: Remove the library

## Requirements

- VS Code 1.74 or later
- Node.js project (requires `package.json` file)
- npm package manager

## Extension Settings

This extension currently does not provide additional settings.

## Known Issues

- Library usage detection is based on static analysis, so dynamic imports or indirect references may not be detected.
- Library usage checking may take time for large projects.
- Tools that are not imported from code (for example `typescript`, `eslint`, `@types/*`) are shown as unused.

## Release Notes

See [CHANGELOG.md](CHANGELOG.md).
