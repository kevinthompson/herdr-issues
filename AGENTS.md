# Working in this repository

This repository holds two things that ship together: the Herdr app's issues panel mod, and the Claude Code plugin whose `issues:*` skills and hooks work the same issues from Claude sessions.

## Layout

### The Herdr mod (`mod/`)

Herdr loads `mod/` as the `issues` mod, and every path in this section is inside it. `mod.json` declares it, and `main.js` is its entry point: the panel listing the issues of the project in the focused pane. Each module opens with a comment saying what it does; read that before changing it.

- `main.js`: the panel, its list, polling and refreshes.
- `detail.js`: one issue drawn in place of the list, with its body and the editor.
- `setup.js`: the setup view drawn in place of the list for a repository with no tracker, or one whose tracker can't load.
- `menu.js`: the status, priority, scope, milestone and label dropdowns, opened as popups of this same mod.
- `worktree-dialog.js` and `worktree.js`: the worktree dialog, and finding and opening issue worktrees and their spaces, and whether a folder is in a linked worktree.
- `space-name.js`: the name of an issue's worktree space, from the repository's `spaceName` setting, and the issue ID read back out of a space's name, so switching to an issue's space opens its issue.
- `issue.js`: statuses, priorities and the rules for grouping issues and whether work can start or finish.
- `scope-context.js`: publishes the listed scope and open issue for the Claude scope hook.
- `work-session.js`: what Start opens in an issue's new worktree space: a Claude session working the issue when `claude` runs, checked once, or else a plain shell tab.
- `edits.js`, `tasks.js`, `changes.js`: field edits saved in the background, checkbox toggles in an issue's body, and the stamp that tells every panel to refresh.
- `lists.js`, `avatars.js`, `file-key.js`: cached lists and avatars in the app's data folder.
- `lookups.js`: the repository, main checkout and settings lookups kept between refreshes, forgotten when `issues.json` or `linear.json` changes.
- `links.js`, `editor.js`, `neovim.js`: links in issue bodies and opening files in the person's editor.
- `location.js`, `visibility.js`, `colors.js`: the focused project, whether the panel is visible, and the colors the theme doesn't name: blends of its colors, and the shades that differ between light and dark themes.
- `collapse.js`: collapsing the panel to a thin strip and expanding it again, by resizing the layout node that holds it.
- `keys.json`: the mod's key bindings, which the setup script merges into Herdr's `keys.json`. `cmd-shift-w` sends `close-space`, which closes the focused space, through the worktree dialog's removal when the space shows a linked worktree. Herdr delivers a mod's commands only to a shown copy, so the key does nothing in a layout without the panel.
- `icons/`: the panel's icons, drawn by their path in Herdr's mods folder, such as `mods/issues/icons/issues.svg`.

Herdr generates `gpui-kit.d.ts` and `jsconfig.json` in the mod folder; they are git-ignored.

### Trackers (`mod/trackers/`)

A tracker is where a repository's issues live. Every backend returns the same shapes, documented at the top of `trackers/index.js`, so the panel never knows which one it shows.

- `trackers/linear.js`: Linear, with `trackers/linear-team.js` finding the team for a Planning Center repository that has no setting. Its `saveLinearKey` saves the API key the setup view's field takes in `linear.json`, once Linear accepts it.
- `trackers/github.js`: GitHub Issues, through the `gh` CLI.
- `trackers/beads.js`: a local Beads database in the main checkout's `.beads/` folder, through the `bd` CLI, for an entry of `{ "tracker": "beads" }`. `checkBeads` checks that `bd` runs and the database exists, and `initializeBeads` makes one, kept out of git through `.git/info/exclude`. Beads keeps its database out of git, so its changes never make a commit.
- `trackers/problems.js`: the errors a person can fix, each with what to do, which the setup view shows. A missing `gh` or `bd` names the install command for each package manager `package-managers.js` finds: `devbox` when its global profile lists packages, and `brew`.

`trackerFor` in `trackers/index.js` chooses one. The repository's entry in `~/.config/herdr-app/issues.json`, which `/issues:config` and the panel's setup view write and `trackers/setting.js` reads, decides first; it is keyed by the main checkout's path, so worktrees share it. Without an entry, it uses Linear.

### The issues CLI (`bin/issues`, `cli/`)

`bin/issues` is a Node script that runs the panel's own modules in `mod/` outside the app, so scripts and skills share one copy of each rule. Those modules import from `herdr`, which exists only inside the app, so it registers a module resolve hook that points `herdr` at `cli/herdr.js`: a shim exporting every name the modules import, following the app's contract in `gpui-kit.d.ts`, for this computer only. The modules load unchanged; a module the CLI loads that imports a new name from `herdr` needs the shim to export it too. The app's `spaces` and `panes` are live and synchronous, so the shim's are empty until the CLI calls its `readLayout`, which reads them from `herdr-app ls` and `hc ls --json`.

- `cli/main.js`: the commands, each answering for the git repository holding the current folder. `issues tracker [--json]` prints the repository's tracker, as `trackerFor` chooses it. `issues branch <id> [--json]` prints the branch an issue is worked on, from `tracker.get`, and refuses an issue an unfinished issue blocks. `issues space-name <issue ID>` prints the name of the issue's worktree space, as the panel names it. `issues setting <key>` prints one of the repository's settings with its default applied, as `mergeSettings` in `trackers/setting.js` resolves it: `merge` or `complete`. `issues auth <linear|github|beads>` checks that tracker's credentials are present, as the panel does: a Linear API key in `linear.json`, `gh` installed and logged in, or `bd` installed with a database in the main checkout; it prints the problem and its fix from `trackers/problems.js` and exits 1 when they aren't, and never prints the key. `issues tab [--json]` prints the ID, name and space name of the Herdr tab holding `$HC_TERMINAL_ID`, and `issues tab rename <issue ID> <name>` renames it after the issue, as `/issues:work` does. `issues worktree <issue ID>` and `issues worktree --branch <branch> [--new]` take `--name` and `--claude` and open the branch in a worktree and a Herdr space.
- `cli/tab.js`: `issues tab`'s lookup in `herdr-app ls` and its renaming rules: only a tab named `Claude` or a number is renamed, and the issue ID prefixes the name unless the tab's space is named after the issue. It imports `exec` from `herdr`, so tests stub it with `stubHerdr`.
- `cli/worktree.js`: `issues worktree`'s checkout and space: it reuses or creates the branch's worktree under `~/.herdr/worktrees/`, fetching origin unless the repository has none or `--new` says the branch can't be there yet, runs the repository's `worktreeSetup` command in a checkout it created, then selects the space showing it or opens one, using `worktree.js`'s `worktreeFor` and `spaceShowing`. It keeps the `issues-worktree-fetched` marker, so several runs in a row fetch once, and takes `issues-worktree-spaces.lock` while it opens a space, both in the git common dir.

### Tests (`test/`)

`npm test` runs every `test/**/*.test.js` with `node --test`. `test/support/register.js`, loaded before each file, points the mod's `herdr` imports at `test/support/herdr.js`, which re-exports the CLI's shim and lets one test replace `exec`, `spaces` and `panes` with `stubHerdr`; it also gives the process a temporary home, so tests never read or write the person's home folder, git configuration or `~/.config/herdr-app`, and puts `test/support/bin/security` first on the `PATH`, a stand-in for macOS's `security` that keeps Keychain items as files in that home, so tests never reach the person's Keychain. `test/support/keychain.js` reads and writes those items. `test/support/repository.js` builds the temporary git repositories the worktree and merge rules run against, one per test.

### The Claude plugin (`claude-plugin/`)

`.claude-plugin/marketplace.json` makes the repository the `herdr-issues` plugin marketplace, and `claude-plugin/` is its one plugin, `issues`.

- `claude-plugin/.claude-plugin/plugin.json`: the plugin's manifest and `version`.
- `claude-plugin/skills/<name>/SKILL.md`: the `issues:config`, `issues:create`, `issues:plan`, `issues:triage`, `issues:start`, `issues:work` and `issues:delegate` skills. `skills/start/start.sh` runs `issues worktree` for each issue `issues:start` names, as the skill loads.
- `claude-plugin/hooks/hooks.json` registers the hooks:
  - `herdr-terminal-env.sh` (SessionStart) exports `HC_TERMINAL_ID` into the Bash tool's environment, so `issues:work` can rename the session's Herdr tab after the issue.
  - `herdr-issues-scope.mjs` (UserPromptSubmit) tells a session in a Herdr terminal which issues the panel lists and which issue it has open.
  - `herdr-issues-changed.mjs` (PostToolUse) touches a stamp after Claude creates or changes a GitHub, Linear or Beads issue, such as closing one whose branch merged, so the panel refreshes at once.

### Repository tooling

- `bootstrap`: the script the README's `curl … | bash` install command downloads. It clones the repository into `~/.local/share/herdr-issues` when that folder isn't there (`HERDR_ISSUES_REPOSITORY_URL` overrides the URL, for tests), then runs that checkout's `install`, giving it `/dev/tty` as standard input when there is a terminal, since piped into `bash` its own standard input is the download. Its body is one function called on the last line, so a download cut short runs nothing.
- `install`: the script `bootstrap` and the one-line `git clone` install command run, after cloning the repository into `~/.local/share/herdr-issues` when it isn't there. It fast-forwards its checkout to `origin/main` and runs `setup`, changing nothing when the checkout has local changes, isn't on `main` or can't fast-forward, and asking before it repoints a mod link to another checkout (refusing when standard input isn't a terminal). Its body is one function, so a fast-forward that rewrites it doesn't change the script while it runs.
- `setup`: installs the mod and the plugin (see below).
- `uninstall`: removes what `setup` installed from its checkout: the mod and CLI links when they point into it, the mod's keys still bound to the mod's actions, and the plugin and marketplace. It asks, defaulting to no, before removing the Issues panel from personal layouts, deleting `issues.json` and `linear.json`, and deleting the cached data in `data/issues/`, and keeps all three without a terminal. Run from `~/.local/share/herdr-issues`, it deletes that checkout last, so like `install` its body is one function; it refuses in a linked worktree.
- `scripts/setup-json.js`: the JSON reading and editing `setup`, `uninstall` and `scripts/demo-setup` do, so they need `node` and not `jq`.
- `scripts/demo-setup`: builds the `blog` and `recipe-app` demo projects under `$DEMO_ROOT` (default `~/Demo`) for recording the panel. Each is a git repository with a committed `.claude/settings.json` whose status line prints nothing, its issues in a local Beads database, an entry of `{ "tracker": "beads", "merge": "auto" }` in `issues.json`, a Herdr space, and a nested worktree space for each issue in progress, opened with this checkout's `bin/issues worktree`; one of those branches is already merged into main, so its row shows as ready to close. Running it again tears the projects down and rebuilds them, and `--teardown` only tears them down: it closes their spaces, removes their worktrees, repositories and `issues.json` entries, and refuses to delete a project folder without the `.herdr-demo` marker it writes. [Recording the demo](CONTRIBUTING.md#recording-the-demo) gives the steps for a recording.
- `.claude/settings.json` registers `.claude/hooks/reload-mod.sh`, which makes Herdr reload the mod after Claude edits one of its files in the checkout Herdr loads.

## Installing for development

Run `./setup` from the main checkout; run from a linked worktree, it refuses and changes nothing, since it would point the mod, the CLI and the plugin at a folder that goes away when the worktree closes. It needs `herdr-app`, `git` and `node` 22.15 or later, which `bin/issues` needs for `module.registerHooks`, `claude` for the plugin, which it skips with a warning without it, and `gh` for repositories tracked in GitHub Issues; it stops before changing anything when a required command is missing or `node` is older, after offering, on a terminal, to install `node` with `devbox global add nodejs` or `brew install node`. It:

- links the checkout's `mod/` folder to `~/.config/herdr-app/mods/issues`, repointing a link an older install made to the checkout itself;
- links `bin/issues` to `~/.local/bin/issues`, refusing to replace a file there that isn't a link;
- merges `mod/keys.json` into `~/.config/herdr-app/keys.json`, keeping any key the person bound to something else, except a binding an earlier version of the mod made, such as `cmd-shift-i` to `layout.toggle:panel`;
- adds the checkout as the `herdr-issues` marketplace and installs or updates `issues@herdr-issues`;
- offers to add the Issues panel in a column of its own beside the side panel (`panel`) of a personal layout, or of a new copy of `main`, unless a layout already shows it; it never writes a shipped layout, and asks nothing when standard input isn't a terminal;
- moves the Issues panel out of `panel-body` in a personal layout an earlier setup put it in, into that column of its own.

Running it again is safe, and is how plugin changes are installed. A person who only uses the panel installs and updates with the README's `curl … | bash` command instead, whose checkout lives in `~/.local/share/herdr-issues`.

## How changes reach the running app and Claude Code

- **The mod** runs from the main checkout's `mod/` folder through the link, so edits there take effect in the running app. Herdr watches its mods folder, but macOS reports a save under the folder a link points to, so `.claude/hooks/reload-mod.sh` touches the link after each Claude edit. Edits in a worktree don't reach the running app until they're merged into main. Changes git makes in the main checkout, such as a merge, pull or checkout, don't reload the mod, since the hook runs only after Claude's own edits: after one that changes `mod/`, run `touch -h ~/.config/herdr-app/mods/issues`.
- **The plugin** is installed into Claude Code's plugin cache, so edits to `claude-plugin/` reach sessions only after it is updated. Bump `version` in `claude-plugin/.claude-plugin/plugin.json` with any change to the skills or hooks that installed sessions should get (minor for new behavior, patch for fixes), then, once it is on main, run `./setup` and start a new Claude Code session.

## Checks before committing

- `npm test` runs the tests.
- `herdr-app check ~/.config/herdr-app/mods/issues` loads the installed mod once and reports what's wrong. In a worktree, check the worktree's mod folder: `herdr-app check "$PWD/mod"`.
- `bash -n bootstrap install setup uninstall scripts/demo-setup .claude/hooks/reload-mod.sh claude-plugin/hooks/*.sh` checks the shell scripts' syntax.
- `shellcheck bootstrap install setup uninstall scripts/demo-setup .claude/hooks/reload-mod.sh claude-plugin/hooks/*.sh`, if `shellcheck` is installed.

## Verifying a UI change

`herdr-app check` proves the mod loads, not that it looks right. Don't verify a change with screenshots unless the person asks for them, even when an issue lists `herdr-app shot`: the running window is the one they work in. When they do, save a frame with `herdr-app shot <file>.png` (the path must end in `.png`) with the change loaded in the running window. `herdr-app status` reports the layout and any mod errors, and `herdr-app --skill` explains driving the window: inspecting spaces and running its commands.

## Issues

This repository's own issues are tracked in GitHub Issues at `kevinthompson/herdr-issues`, as its entry in `~/.config/herdr-app/issues.json` says. Work them with the `issues:*` skills, for example `/issues:work #2`; an issue's branch is `<number>-<title as a slug>`.

## Conventions

- Commits follow Conventional Commits. Mod and skill changes have used the `issues` scope; recent commits name the narrower area instead, such as `skills`, `worktree`, `github` or `list`.
- Each commit is one vertical slice: it does one thing end to end, and the subjects read in order explain the change.
- The repository has one contributor, so a finished branch is merged into main locally, once the person approves it: its entry in `issues.json` sets `merge` to `review`.
