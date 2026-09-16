# Changelog

## [Unreleased]

### Added

- Sidebar tree of commands, read from `.vscode/cockpit.jsonc`.
- Five argument types: text input, dropdown, shell-populated dropdown, on/off flag, multi-select.
- Argument values are remembered per workspace and shown inline in the tree.
- Arguments are quoted by VS Code for the active shell, so values with spaces survive PowerShell, cmd, bash and zsh.
- JSON Schema with autocomplete and inline documentation for the config file.
- Copy the assembled command line to the clipboard.
- Export a folder's config to a file you choose - comments and formatting intact - for
  backing it up or sharing it outside the repo.
- Import a config file, either merging its commands into the current config (skipping any
  id already in use) or replacing it outright.

### Fixed

- Extension host crashed on activation with `Cannot find module ./impl/format`.
  The bundler resolved `jsonc-parser` to its UMD entry, which does a runtime
  `require()` that cannot resolve once bundled. The build now prefers ESM entries.
