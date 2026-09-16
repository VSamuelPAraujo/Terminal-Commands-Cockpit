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
- `pick`/`multiPick` options can carry their own `"default": true` instead of repeating the
  value in the arg's own `"default"`. `multiPick` may mark several; `pick` may mark one.
- A command can set `"resetAfterRun": true` to clear every remembered value once it has
  actually launched (not if you back out at the confirmation prompt). An argument with its
  own `"default"` reverts to showing that default rather than "not set" - only the
  remembered override is cleared. Meant for one-off values, like a branch name being
  created or promoted, where silently reusing last run's value is the risky failure mode.

### Fixed

- Extension host crashed on activation with `Cannot find module ./impl/format`.
  The bundler resolved `jsonc-parser` to its UMD entry, which does a runtime
  `require()` that cannot resolve once bundled. The build now prefers ESM entries.
- Editing an argument, running a command, or clearing/resetting a value never updated the
  visible row - it kept showing the old value (or "not set") until something forced a full
  tree rebuild. Every node now gets a stable id, and the sidebar redraws from the root after
  any value changes, instead of asking VS Code to refresh one specific row by passing it a
  freshly-built node object it has no way to recognise. The stable ids mean this full redraw
  still keeps expand/collapse state and scroll position, so nothing is lost by not targeting
  a single row.
