# Working in this repository

This repository holds two things that ship together: the Herdr app's issues panel mod, and the Claude Code plugin whose `issues:*` skills and hooks work the same issues from Claude sessions.

## Layout

Each file opens with a comment saying what it does; read that before changing it. A change that adds a file or a command describes it in that file's opening comment (or `USAGE` in `cli/main.js`), not here, unless it adds a top-level folder.

- `mod/`: the Herdr mod, loaded as `issues`. `mod.json` declares it, `main.js` is the panel, and `keys.json` holds the key bindings `setup` merges into Herdr's. Herdr generates the git-ignored `gpui-kit.d.ts` and `jsconfig.json` here.
- `mod/trackers/`: the backends for Linear, GitHub Issues and Beads, all returning the shapes `index.js` documents; `setting.js` reads each repository's entry in `~/.config/herdr-app/issues.json`.
- `bin/issues` and `cli/`: the `issues` CLI, which runs the mod's own modules in Node with `cli/herdr.js` standing in for the app's `herdr` module. `issues --help` lists its commands.
- `test/`: `npm test`'s tests; `test/support/` isolates them from the person's home folder, git configuration and Keychain.
- `claude-plugin/`: the `issues` Claude Code plugin, with its skills and hooks; `.claude-plugin/marketplace.json` makes the repository its marketplace.
- `bootstrap`, `install`, `setup`, `uninstall` and `scripts/`: installing, updating and removing the mod and plugin, and building the demo projects.

## Installing for development

Run `./setup` from the main checkout; run from a linked worktree, it refuses and changes nothing, since it would point the mod, the CLI and the plugin at a folder that goes away when the worktree closes. It needs `herdr-app`, `git` and `node` 22.15 or later, which `bin/issues` needs for `module.registerHooks`, `claude` for the plugin, which it skips with a warning without it, and `gh` for repositories tracked in GitHub Issues; it stops before changing anything when a required command is missing or `node` is older, after offering, on a terminal, to install `node` with `devbox global add nodejs` or `brew install node`. Its opening comment lists what it installs.

Running it again is safe, and is how plugin changes are installed. A person who only uses the panel installs and updates with the README's `curl … | bash` command instead, whose checkout lives in `~/.local/share/herdr-issues`.

## How changes reach the running app and Claude Code

- **The mod** runs from the main checkout's `mod/` folder through the link, so edits there take effect in the running app. Herdr watches its mods folder, but macOS reports a save under the folder a link points to, so `.claude/hooks/reload-mod.sh` touches the link after each Claude edit. Edits in a worktree don't reach the running app until they're merged into main. Changes git makes in the main checkout, such as a merge, pull or checkout, don't reload the mod, since the hook runs only after Claude's own edits: after one that changes `mod/`, run `touch -h ~/.config/herdr-app/mods/issues`.
- **The plugin** is installed into Claude Code's plugin cache, so edits to `claude-plugin/` reach sessions only after it is updated. Bump `version` in `claude-plugin/.claude-plugin/plugin.json` with any change to the skills or hooks that installed sessions should get (minor for new behavior, patch for fixes), then, once it is on main, run `./setup` and start a new Claude Code session.

## Checks before committing

- `npm test` runs the tests.
- `herdr-app check ~/.config/herdr-app/mods/issues` loads the installed mod once and reports what's wrong. In a worktree, check the worktree's mod folder: `herdr-app check "$PWD/mod"`.
- `bash -n bootstrap install setup uninstall scripts/demo-setup .claude/hooks/reload-mod.sh claude-plugin/hooks/*.sh` checks the shell scripts' syntax.
- `shellcheck` with the same files, if it is installed.

## Verifying a UI change

`herdr-app check` proves the mod loads, not that it looks right. Don't verify a change with screenshots unless the person asks for them, even when an issue lists `herdr-app shot`: the running window is the one they work in. When they do, save a frame with `herdr-app shot <file>.png` (the path must end in `.png`) with the change loaded in the running window. `herdr-app status` reports the layout and any mod errors, and `herdr-app --skill` explains driving the window: inspecting spaces and running its commands.

## Issues

This repository's own issues are tracked in GitHub Issues at `kevinthompson/herdr-issues`, so its entry in `~/.config/herdr-app/issues.json` sets `"tracker": "github"`. Work them with the `issues:*` skills, for example `/issues:work #2`; an issue's branch is `<number>-<title as a slug>`.

## Conventions

- Commits follow Conventional Commits. Mod and skill changes have used the `issues` scope; recent commits name the narrower area instead, such as `skills`, `worktree`, `github` or `list`.
- Each commit is one vertical slice: it does one thing end to end, and the subjects read in order explain the change.
- Any model or effort the mod or its skills choose, such as the issue sessions' `workModel` and `workEffort`, is an `issues.json` setting with a default, checked in `mod/trackers/setting.js` and read with `issues setting <key>`; nothing hard-codes one.
- Changes from contributors arrive as pull requests against `main`. How a finished branch lands is the person's own setting: run `issues setting approval` and `issues setting onApproval` in the repository before landing one, and follow what they print each time rather than assuming it. `approval` `ask` asks the person before the work lands and `auto` goes straight on; `onApproval` `merge` then merges the branch into main locally, and `pull-request` opens a pull request.
