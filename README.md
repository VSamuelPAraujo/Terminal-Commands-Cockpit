<div align="center">

<img src="media/icon.png" width="88" height="88" alt="Terminal Commands Cockpit icon" />

# Terminal Commands Cockpit

**Save and run your favourite terminal commands from the sidebar — with their arguments.**

[![Version](https://img.shields.io/visual-studio-marketplace/v/SamuelAraujo.terminal-commands-cockpit?color=5FE39B&label=Marketplace)](https://marketplace.visualstudio.com/items?itemName=SamuelAraujo.terminal-commands-cockpit)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/SamuelAraujo.terminal-commands-cockpit?color=5FE39B)](https://marketplace.visualstudio.com/items?itemName=SamuelAraujo.terminal-commands-cockpit)
[![Open VSX](https://img.shields.io/open-vsx/v/SamuelAraujo/terminal-commands-cockpit?color=5FE39B&label=Open%20VSX)](https://open-vsx.org/extension/SamuelAraujo/terminal-commands-cockpit)
[![License: MIT](https://img.shields.io/badge/license-MIT-5FE39B)](LICENSE)

</div>

---

<!--
  SCREENSHOT — hero shot. The single most important image in this file.
  Capture: the sidebar tree expanded on a real command (e.g. "Promote branch"),
  showing several argument rows with real values set (not "not set"), so it
  reads as a working tool, not an empty state. Save as media/screenshots/hero.png
  and replace this comment with:
  ![Cockpit sidebar showing an expanded command with its arguments](media/screenshots/hero.png)
-->

Most command-runner extensions give you buttons that fire a fixed string. Cockpit gives each
command **real, editable arguments** — text boxes, dropdowns, on/off switches, multi-select
lists, and dropdowns whose options come from a shell command you choose: your live git
branches, your docker containers, your Kubernetes namespaces.

```
▼ Deploy                           ▶
    Environment      staging       ✎
    Release tag      v2.4.1        ✎
    Only packages    api, web      ✎
    Skip migrations  off           ✎
    Dry run          on            ✎
▶ Run tests                        ▶
▶ Tail container logs              ▶
```

Click a value to change it. Click ▶ to run. Your choices are remembered, so tomorrow it's
one click — not a paragraph copied out of a README with the branch name half-edited.

## Why

If your team's runbook looks like this:

```bash
npm run deploy -- --env staging --tag v2.4.1 --only api,web --skip-migrations --dry-run
```

…then nobody types it correctly from memory. They copy it out of a doc, edit the tag, forget
`--dry-run`, and find out afterwards. Cockpit turns that line into a form, so the only thing
left to get wrong is the actual decision — which value to pick — not the syntax around it.

## What you get

| | |
| --- | --- |
| 🎛️ **Five argument types** | Text input, fixed dropdown, on/off switch, multi-select, and a dropdown populated by a shell command you write |
| 🌿 **Live git branches, not guesses** | A `shellPick` argument can list your actual branches, tags, docker containers — whatever a command's stdout gives you |
| 🧠 **Remembers what you picked** | Values persist per workspace, so a command you ran yesterday is one click today — not a re-typed essay |
| 🧹 **Resets what shouldn't stick** | Mark a command `resetAfterRun` and its one-off values (a branch you just created) clear themselves, while defaults stay put |
| ✍️ **No JSON to learn first** | Paste a command you already run, tick which parts should be editable, and Cockpit writes the config for you |
| 🔒 **Correct quoting, every shell** | Arguments are quoted by VS Code itself, so a value with spaces survives PowerShell, cmd, bash and zsh without you escaping anything |
| 📤 **Import / export** | Share a config with a teammate or another project as a file — comments and formatting intact |

## See it in action

<!--
  SCREENSHOT — the Add Command flow, ideally 2-3 frames or a short GIF:
  1) pasting a command line into the input box
  2) the multi-select QuickPick showing which parts were detected as arguments
  3) the finished command expanded in the tree
  Save as media/screenshots/add-command.png (or .gif) and add:
  ![Pasting a command and turning it into editable arguments](media/screenshots/add-command.png)
-->

**Turn a command you already run into a form**, without writing any config by hand — paste
the command line, tick which parts should stay editable, pick a control for each.

<!--
  SCREENSHOT — a shellPick dropdown open, ideally the branch picker, showing
  real branch names in the QuickPick list.
  Save as media/screenshots/shell-pick.png and add:
  ![A dropdown listing branches from a live git command](media/screenshots/shell-pick.png)
-->

**Dropdowns backed by a real command** — branches, tags, running containers, whatever `stdout`
gives you, refreshed every time you open the picker.

<!--
  SCREENSHOT — the "..." overflow menu open showing Import Config / Export Config.
  Save as media/screenshots/import-export.png and add:
  ![The Import Config and Export Config menu items](media/screenshots/import-export.png)
-->

**Share a config like any other file** — export it, hand it to a teammate, import it into
another project. Comments and formatting survive the round trip.

## Getting started

1. Open the **Cockpit** icon in the activity bar.
2. Click **Add command** and paste a command line you already run.
3. Tick which parts should stay editable, and choose a control for each.

Cockpit writes the config for you. There is no JSON to learn before you get value out of it.

Already have a config from another project? Use **Import Config** from the "..." menu at the top
of the sidebar — it merges the imported commands in (skipping any id you already have) or replaces
the config outright, your choice. **Export Config** does the reverse: saves a folder's config,
comments and formatting intact, to a file you can hand to a teammate or another project.

## Configuration

Commands live in `.vscode/cockpit.jsonc`, so they're shared with your team through version control.
The file has a JSON Schema attached — you get autocomplete, hover documentation and validation
while editing.

```jsonc
{
  "version": 1,
  "commands": [
    {
      "label": "Deploy",
      "group": "Release",
      "icon": "cloud-upload",
      "command": "npm run deploy --",
      "confirm": true,
      "resetAfterRun": true,
      "args": [
        {
          "id": "env",
          "kind": "pick",
          "label": "Environment",
          "flag": "--env",
          "default": "staging",
          "options": ["staging", "production"]
        },
        {
          "id": "tag",
          "kind": "shellPick",
          "label": "Release tag",
          "flag": "--tag",
          "command": "git tag --sort=-creatordate",
          "required": true
        },
        {
          "id": "packages",
          "kind": "multiPick",
          "label": "Only packages",
          "flag": "--only",
          "options": ["api", "web", "worker", "shared", "cli"]
        },
        { "id": "dryRun", "kind": "flag", "label": "Dry run", "flag": "--dry-run", "default": true }
      ]
    }
  ]
}
```

See [`examples/monorepo.jsonc`](examples/monorepo.jsonc) for a complete config covering every argument type.

### Argument types

| `kind`      | Control                  | Emits                                     |
| ----------- | ------------------------ | ------------------------------------------ |
| `input`     | Text box                 | `-Flag value`                              |
| `pick`      | Dropdown, fixed options  | `-Flag chosen`                             |
| `shellPick` | Dropdown from a command  | `-Flag chosen` — options from its stdout   |
| `flag`      | On/off switch            | `-Flag` when on, nothing when off          |
| `multiPick` | Multi-select list        | `-Flag a,b,c` (separator configurable)     |

Omit `flag` to pass the value positionally. `pick`/`multiPick` options can carry their own
`"default": true` instead of repeating the value in the arg's own `"default"`.

### Command options

| Property         | Purpose                                                              |
| ----------------- | --------------------------------------------------------------------- |
| `label`           | Name in the sidebar                                                   |
| `command`         | The fixed part of the command line                                    |
| `args`            | The editable parts                                                    |
| `group`           | Nests related commands under a heading                                |
| `icon`            | Any [codicon](https://microsoft.github.io/vscode-codicons/) name      |
| `cwd`             | Working directory, relative to the workspace folder                   |
| `env`             | Extra environment variables                                           |
| `confirm`         | Show the assembled command line before running it                     |
| `resetAfterRun`   | Clear remembered values once the command actually launches            |

## Settings

| Setting                       | Default                  | Purpose                                     |
| ------------------------------ | ------------------------ | -------------------------------------------- |
| `cockpit.configFile`           | `.vscode/cockpit.jsonc`  | Where the config lives                       |
| `cockpit.rememberArguments`    | `true`                   | Remember the last value of each argument     |
| `cockpit.confirmBeforeRun`     | `false`                  | Always confirm before running                |
| `cockpit.shellPickTimeoutMs`   | `10000`                  | How long to wait for a `shellPick` command   |

## Quoting

Arguments are handed to VS Code as quoted tokens, so a value containing spaces survives PowerShell,
cmd, bash and zsh without you escaping anything. Commands run as VS Code tasks, appearing in the
normal terminal panel with your usual shell and environment.

## Development

```bash
bun install
bun run build     # or: bun run watch
```

Press <kbd>F5</kbd> to launch an Extension Development Host with Cockpit loaded.

```bash
bun run check     # typecheck
bun run smoke     # loads the built bundle and calls activate()
bun run package   # produce a .vsix
```

## License

MIT
