# TODO

Everything outstanding before the first public release. Ticked items are done.

## Before publishing

- [ ] **Verify the UI actually runs.** Nothing below matters until this is done.
      - `code --install-extension terminal-commands-cockpit-0.0.1.vsix`, or <kbd>F5</kbd> for a dev host
      - Check: the activity-bar icon appears, commands expand into argument rows,
        editing a value updates the row, ▶ runs in a terminal with the right quoting
      - Check the `shellPick` dropdown really lists git branches on Windows
        (`git for-each-ref --format=%(refname:short) refs/heads` goes through `cmd.exe`
        via `child_process.exec`, and `%(...)` could be mangled by cmd variable expansion)
- [ ] **Record the Add Command flow** and put it at the top of `README.md`
      — a GIF of paste → tick → pick control is the single best thing for the marketplace page.
      A placeholder comment marks the spot.
- [ ] **Personal Microsoft account** → create a **free personal** Azure DevOps organization.
      Use a personal identity, kept entirely separate from any employer account or
      work credentials.
- [x] **Register the publisher** at <https://marketplace.visualstudio.com/manage> —
      done, ID `SamuelAraujo`, matching `package.json` exactly.
- [ ] **Publish to the VS Code Marketplace**: `az login` then `bun run publish:vsce`.
      Uses `vsce publish --azure-credential` (Entra ID).
      Ignore every PAT-based tutorial: Azure DevOps blocked creation of new global PATs
      on 2026-03-15 and retires them entirely on 2026-12-01.
- [ ] **Publish to Open VSX**: `bun run publish:ovsx`. Needs an Eclipse Foundation
      account via GitHub login — no Microsoft account involved. Covers Cursor,
      Windsurf, VSCodium and Gitpod users, and is the fallback if the Marketplace
      publisher setup stalls.
- [ ] Bump `version` from `0.0.1` and move the CHANGELOG entries out of `[Unreleased]`.

## Keep the repo clean

This is a public repository. Never commit configs describing a real employer's
project — module names, branch models and internal script names all count.

- `.gitignore` covers `*.local.jsonc` and `examples/private-*`
- Keep workplace configs at `examples/private-*.jsonc`, or in the consuming
  project's own `.vscode/cockpit.jsonc`
- `examples/monorepo.jsonc` is the neutral example that ships publicly

## Known gaps

- [x] A smoke test (`bun run smoke`) loads the built bundle behind a stubbed `vscode`
      and calls `activate()`. It runs as part of `vscode:prepublish`.
- [ ] No unit tests yet. The riskiest logic is `parseCommandLine` in `src/authoring.ts`
      and `tokenize` in `src/runner.ts` — both are pure functions and easy to cover.
- [ ] `shellPick` options are fetched every time the dropdown opens; no caching.
- [ ] No way to edit or delete an existing command from the sidebar — you edit the
      JSON by hand. Only *adding* has a guided flow.
- [ ] No reordering of commands or arguments except by editing the config.
- [ ] Argument values are remembered per workspace, so they don't follow you
      between machines. This is probably correct, but worth confirming with users.

## Ideas not committed to

- [ ] Import existing scripts from `package.json` / `tasks.json` as a starting point.
- [ ] `dependsOn`, so one command can chain into another.
- [ ] A `when` clause on arguments, to show one only if another has a given value.
- [ ] Run history, with a re-run of an exact previous invocation.

## Done

- [x] Sidebar tree with commands expanding into argument rows
- [x] Five argument types: input, pick, shellPick, flag, multiPick
- [x] Values remembered per workspace and command
- [x] Per-shell quoting via `ShellQuotedString`
- [x] JSON Schema with autocomplete and hover docs
- [x] Paste-to-parameterize flow for adding commands
- [x] 128×128 marketplace icon
- [x] Publisher identity and repository URLs
- [x] Pushed to GitHub
