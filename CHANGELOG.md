# Changelog

## [Unreleased]

### Added

- Sidebar tree of commands, read from `.vscode/cockpit.jsonc`.
- Five argument types: text input, dropdown, shell-populated dropdown, on/off flag, multi-select.
- Argument values are remembered per workspace and shown inline in the tree.
- Arguments are quoted by VS Code for the active shell, so values with spaces survive PowerShell, cmd, bash and zsh.
- JSON Schema with autocomplete and inline documentation for the config file.
- Copy the assembled command line to the clipboard.
