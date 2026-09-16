# Releasing

How to ship a change — from editing `src/` to an updated `.vsix` on the Marketplace and
Open VSX. `TODO.md` covers the **one-time** account/publisher setup; this file is the
**repeatable** process once that's done.

## 1. Make your change, then check the basics

```bash
bun run check    # typecheck
bun run build    # bundle src/ to dist/extension.js
bun run smoke    # loads the built bundle behind a stubbed vscode and calls activate()
```

`smoke` exists because of a real incident: the extension once shipped with a bundling bug
that crashed on activation, and nothing before that step would have caught it. Don't skip it.

## 2. Decide whether this needs a version bump

Not everything does — a docs-only change or an internal refactor with no user-visible effect
can just be committed. A version bump is for anything a user would notice: a new feature, a
fixed bug, a changed setting or config option.

**We're keeping `0.0.1` until there's an actual reason to move off it** — don't bump it
speculatively. When the time comes, `package.json`'s `"version"` follows semver
(`MAJOR.MINOR.PATCH`):

| Bump | When | Example |
| --- | --- | --- |
| **patch** | A bug fix, no new capability | `0.0.1` → `0.0.2` |
| **minor** | A new feature, backward compatible | `0.0.1` → `0.1.0` |
| **major** | Breaks the config format or a setting | `0.1.0` → `1.0.0` |

## 3. If you are bumping the version

1. Edit `"version"` in `package.json`.
2. In `CHANGELOG.md`, turn `## [Unreleased]` into `## [x.y.z] - YYYY-MM-DD` and add a fresh,
   empty `## [Unreleased]` above it for whatever comes next.

## 4. Build and package

```bash
bun run check
bun run build -- --minify
bun run smoke
bun run package     # vsce package - produces terminal-cockpit-<version>.vsix
```

The `.vsix` lands in the project root. `.vscodeignore` controls what's actually inside it —
source, tests, examples and internal docs (like this file and `TODO.md`) are excluded; only
`dist/`, `media/`, `schemas/`, and the top-level docs a user should see are packaged.

## 5. Test the built .vsix locally before publishing anything

```bash
code --uninstall-extension SamuelAraujo.terminal-cockpit
code --install-extension terminal-cockpit-<version>.vsix --force
```

Reload the window and actually click through the sidebar. `bun run smoke` only proves the
extension activates without crashing — it says nothing about whether the UI behaves.

> Uninstall first if you're re-testing the **same** version number — VS Code doesn't always
> pick up an in-place reinstall of an unchanged version without it.

## 6. Commit, tag, push

```bash
git add -A
git commit -m "release: vX.Y.Z"
git tag vX.Y.Z
git push origin main --tags
```

Skip the tag for a change that didn't bump the version.

## 7. Publish

```bash
bun run publish:vsce    # vsce publish --azure-credential - needs `az login` done first
bun run publish:ovsx    # ovsx publish - needs OVSX_PAT set, a token from open-vsx.org, not az
```

Both read the version straight out of `package.json` — there's nothing else to pass them.
See `TODO.md` for what `az login` and `OVSX_PAT` actually require, if you haven't set either
up yet.

## If a bad version goes out

The Marketplace doesn't let you delete a version, only unpublish or deprecate one, and you can
never re-publish the same version number again even after unpublishing it.

1. Fix the bug, bump the version again (a fresh number, not a re-push of the broken one).
2. If the broken version is actively harmful in the meantime, unpublish it from
   [marketplace.visualstudio.com/manage](https://marketplace.visualstudio.com/manage) — the
   previous version becomes "latest" again for anyone who hasn't updated yet.
