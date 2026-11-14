# Working in this repository

This repository holds two things that ship together: the Herdr app's issues panel mod, and the Claude Code plugin whose `issues:*` skills and hooks work the same issues from Claude sessions.

## Layout

### The Herdr mod (repository root)

Herdr loads the root folder as the `issues` mod. `mod.json` declares it, and `main.js` is its entry point: the panel listing the issues of the project in the focused pane. Each module opens with a comment saying what it does; read that before changing it.

- `main.js`: the panel, its list, polling and refreshes.
- `detail.js`: one issue drawn in place of the list, with its body and the editor.
- `setup.js`: the setup view drawn in place of the list for a repository with no tracker, or one whose tracker can't load.
- `menu.js`: the status, priority, scope, milestone and label dropdowns, opened as popups of this same mod.
- `worktree-dialog.js` and `worktree.js`: the worktree dialog, and finding and opening issue worktrees and their spaces.
- `issue.js`: statuses, priorities and the rules for grouping issues and whether work can start or finish.
- `scope-context.js`: publishes the listed scope and open issue for the Claude scope hook.
- `edits.js`, `tasks.js`, `changes.js`: field edits saved in the background, checkbox toggles in an issue's body, and the stamp that tells every panel to refresh.
- `lists.js`, `avatars.js`, `file-key.js`: cached lists and avatars in the app's data folder.
- `links.js`, `editor.js`, `neovim.js`: links in issue bodies and opening files in the person's editor.
- `location.js`, `visibility.js`, `colors.js`: the focused project, whether the panel is visible, and blended theme colors.
- `keys.json`: the mod's key bindings, which the setup script merges into Herdr's `keys.json`.
- The `*.svg` files at the root are the panel's icons.

Herdr generates `gpui-kit.d.ts` and `jsconfig.json` in the mod folder; they are git-ignored.

### Trackers (`trackers/`)

A tracker is where a repository's issues live. Every backend returns the same shapes, documented at the top of `trackers/index.js`, so the panel never knows which one it shows.

- `trackers/linear.js`: Linear, with `trackers/linear-team.js` finding the team for a Planning Center repository that has no setting.
- `trackers/github.js`: GitHub Issues, through the `gh` CLI.
- `trackers/problems.js`: the errors a person can fix, each with what to do, which the setup view shows.

`trackerFor` in `trackers/index.js` chooses one. The repository's entry in `~/.config/herdr-app/issues.json`, which `/issues:config` and the panel's setup view write and `trackers/setting.js` reads, decides first; it is keyed by the main checkout's path, so worktrees share it. Without an entry, it uses Linear.

### The issues CLI (`bin/issues`, `cli/`)

`bin/issues` is a Node script that runs the panel's own modules outside the app, so scripts and skills share one copy of each rule. Those modules import from `herdr`, which exists only inside the app, so it registers a module resolve hook that points `herdr` at `cli/herdr.js`: a shim exporting every name the modules import, following the app's contract in `gpui-kit.d.ts`, for this computer only. The modules load unchanged; a module the CLI loads that imports a new name from `herdr` needs the shim to export it too.

- `cli/main.js`: the commands, each answering for the git repository holding the current folder. `issues tracker [--json]` prints the repository's tracker, as `trackerFor` chooses it. `issues branch <id> [--json]` prints the branch an issue is worked on, from `tracker.get`, and refuses an issue an unfinished issue blocks.

### The Claude plugin (`claude-plugin/`)

`.claude-plugin/marketplace.json` makes the repository the `herdr-issues` plugin marketplace, and `claude-plugin/` is its one plugin, `issues`.

- `claude-plugin/.claude-plugin/plugin.json`: the plugin's manifest and `version`.
- `claude-plugin/skills/<name>/SKILL.md`: the `issues:config`, `issues:create`, `issues:plan`, `issues:triage`, `issues:work` and `issues:delegate` skills.
- `claude-plugin/hooks/hooks.json` registers the hooks:
  - `herdr-terminal-env.sh` (SessionStart) exports `HC_TERMINAL_ID` into the Bash tool's environment, so `issues:work` can rename the session's Herdr tab after the issue.
  - `herdr-issues-scope.sh` (UserPromptSubmit) tells a session in a Herdr terminal which issues the panel lists and which issue it has open.
  - `herdr-issues-created.sh` (PostToolUse) touches a stamp after Claude creates a GitHub or Linear issue, so the panel refreshes at once.

### Repository tooling

- `setup`: installs the mod and the plugin (see below).
- `.claude/settings.json` registers `.claude/hooks/reload-mod.sh`, which makes Herdr reload the mod after Claude edits one of its files in the checkout Herdr loads.

## Installing for development

Run `./setup` from the main checkout. It needs `herdr-app`, `claude`, `jq`, `git` and `node`, and `gh` for repositories tracked in GitHub Issues. It:

- links the checkout to `~/.config/herdr-app/mods/issues`;
- links `bin/issues` to `~/.local/bin/issues`, refusing to replace a file there that isn't a link;
- merges `keys.json` into `~/.config/herdr-app/keys.json`, keeping any key the person bound to something else;
- adds the checkout as the `herdr-issues` marketplace and installs or updates `issues@herdr-issues`;
- offers to add the Issues panel to the side panel (`panel-body`) of a personal layout, or of a new copy of `main`, unless a layout already shows it; it never writes a shipped layout, and asks nothing when standard input isn't a terminal.

Running it again is safe, and is how plugin changes are installed.

## How changes reach the running app and Claude Code

- **The mod** runs from the main checkout through the link, so edits there take effect in the running app. Herdr watches its mods folder, but macOS reports a save under the folder a link points to, so `.claude/hooks/reload-mod.sh` touches the link after each Claude edit. Edits in a worktree don't reach the running app until they're merged into main.
- **The plugin** is installed into Claude Code's plugin cache, so edits to `claude-plugin/` reach sessions only after it is updated. Bump `version` in `claude-plugin/.claude-plugin/plugin.json` with any change to the skills or hooks that installed sessions should get (minor for new behavior, patch for fixes), then, once it is on main, run `./setup` and start a new Claude Code session.

## Checks before committing

- `herdr-app check ~/.config/herdr-app/mods/issues` loads the installed mod once and reports what's wrong. In a worktree, check the worktree itself: `herdr-app check "$PWD"`.
- `bash -n setup .claude/hooks/reload-mod.sh claude-plugin/hooks/*.sh` checks the shell scripts' syntax.
- `shellcheck setup .claude/hooks/reload-mod.sh claude-plugin/hooks/*.sh`, if `shellcheck` is installed.

## Verifying a UI change

`herdr-app check` proves the mod loads, not that it looks right. With the change loaded in the running window, save a frame with `herdr-app shot <file>.png` (the path must end in `.png`) and look at it, before and after the change. `herdr-app status` reports the layout and any mod errors, and `herdr-app --skill` explains driving the window: inspecting spaces and running its commands.

## Issues

This repository's own issues are tracked in GitHub Issues at `kevinthompson/herdr-issues-mod`, as its entry in `~/.config/herdr-app/issues.json` says. Work them with the `issues:*` skills, for example `/issues:work #2`; an issue's branch is `<number>-<title as a slug>`.

## Conventions

- Commits follow Conventional Commits. Mod and skill changes have used the `issues` scope; recent commits name the narrower area instead, such as `skills`, `worktree`, `github` or `list`.
- Each commit is one vertical slice: it does one thing end to end, and the subjects read in order explain the change.
- The repository has one contributor, so a finished branch is merged into main locally.
