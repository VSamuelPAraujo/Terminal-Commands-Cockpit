# Terminal Commands Cockpit for Visual Studio Code

Save and run your favourite terminal commands from the sidebar — **with their arguments**.

Most command-runner extensions give you buttons that fire a fixed string. Cockpit gives each
command real, editable arguments: text boxes, dropdowns, on/off switches, multi-select lists, and
dropdowns whose options come from a **shell command you choose** — your live git branches, your
docker containers, your Kubernetes namespaces.

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

Click a value to change it. Click ▶ to run. Your choices are remembered, so tomorrow it's one click.

## Why

If your team's runbook looks like this:

```bash
npm run deploy -- --env staging --tag v2.4.1 --only api,web --skip-migrations --dry-run
```

…then nobody types it correctly from memory. They copy it out of a README, edit the branch name,
forget `--dry-run`, and find out afterwards. Cockpit turns that line into a form.

## Getting started

1. Open the **Cockpit** icon in the activity bar.
2. Click **Add command** and paste a command line you already run.
3. Tick which parts should stay editable, and choose a control for each.

Cockpit writes the config for you. There is no JSON to learn before you get value out of it.

Already have a config from another project? Use **Import Config** from the "..." menu at the top
of the sidebar - it merges the imported commands in (skipping any id you already have) or replaces
the config outright, your choice. **Export Config** does the reverse: saves a folder's config,
comments and formatting intact, to a file you can hand to a teammate or another project.

<!-- TODO: add a screen recording of the Add Command flow before publishing -->

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
| ----------- | ------------------------ | ----------------------------------------- |
| `input`     | Text box                 | `-Flag value`                             |
| `pick`      | Dropdown, fixed options  | `-Flag chosen`                            |
| `shellPick` | Dropdown from a command  | `-Flag chosen` — options from its stdout  |
| `flag`      | On/off switch            | `-Flag` when on, nothing when off         |
| `multiPick` | Multi-select list        | `-Flag a,b,c` (separator configurable)    |

Omit `flag` to pass the value positionally.

### Command options

| Property      | Purpose                                                           |
| ------------- | ----------------------------------------------------------------- |
| `label`       | Name in the sidebar                                               |
| `command`     | The fixed part of the command line                                |
| `args`        | The editable parts                                                |
| `group`       | Nests related commands under a heading                            |
| `icon`        | Any [codicon](https://microsoft.github.io/vscode-codicons/) name  |
| `cwd`         | Working directory, relative to the workspace folder               |
| `env`         | Extra environment variables                                       |
| `confirm`     | Show the assembled command line before running it                 |

## Settings

| Setting                     | Default                  | Purpose                                     |
| --------------------------- | ------------------------ | ------------------------------------------- |
| `cockpit.configFile`        | `.vscode/cockpit.jsonc`  | Where the config lives                      |
| `cockpit.rememberArguments` | `true`                   | Remember the last value of each argument    |
| `cockpit.confirmBeforeRun`  | `false`                  | Always confirm before running               |
| `cockpit.shellPickTimeoutMs`| `10000`                  | How long to wait for a `shellPick` command  |

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
bun run package   # produce a .vsix
```

## License

MIT
