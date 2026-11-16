# Contributing

This repository holds the Herdr app's Issues panel mod and the Claude Code plugin whose `issues:*` skills work the same issues. [AGENTS.md](AGENTS.md) describes how it is laid out and has the full detail behind each step below.

## Setting up for development

Clone the repository and run `./setup` from its main checkout. It needs `herdr-app`, `git` and `node` 22.15 or later, `claude` for the plugin, which it skips with a warning without it, and `gh` for repositories tracked in GitHub Issues. It links the checkout's `mod/` folder into Herdr's mods folder, links `bin/issues` into `~/.local/bin`, merges the mod's key bindings and installs the Claude plugin. Run from a linked worktree, it refuses and changes nothing.

Running `./setup` again is safe. See [Installing for development](AGENTS.md#installing-for-development).

## How changes reach the running app and Claude Code

- **The mod** runs from the main checkout's `mod/` folder, so edits there take effect in the running app. Edits in a worktree reach it only once they're merged into main.
- **The plugin** is installed into Claude Code's plugin cache. Bump `version` in `claude-plugin/.claude-plugin/plugin.json` with any change to the skills or hooks, then, once it is on main, run `./setup` and start a new Claude Code session.

See [How changes reach the running app and Claude Code](AGENTS.md#how-changes-reach-the-running-app-and-claude-code).

## Checks before committing

```sh
npm test
herdr-app check ~/.config/herdr-app/mods/issues   # in a worktree: herdr-app check "$PWD/mod"
bash -n bootstrap install setup uninstall .claude/hooks/reload-mod.sh claude-plugin/hooks/*.sh
shellcheck bootstrap install setup uninstall .claude/hooks/reload-mod.sh claude-plugin/hooks/*.sh
```

`shellcheck` is optional. See [Checks before committing](AGENTS.md#checks-before-committing).

## Commit conventions

Commits follow [Conventional Commits](https://www.conventionalcommits.org), and each commit is one vertical slice: it does one thing end to end, so the subjects read in order explain the change. See [Conventions](AGENTS.md#conventions).

## Pull requests

Open a pull request against `main` from a branch of your fork. Say what the change does and why, how you checked it, and, for a change to the panel, include before-and-after screenshots.

## Recording the demo

Record against `~/Code/herdr-issues-demo` (clone `kevinthompson/herdr-issues-demo` there if you don't have it), which holds a `blog` project with its issues in a local Beads database, so a recording shows none of your own repositories or tracker accounts.

1. Run `~/Code/herdr-issues-demo/bin/reset` before each take. It resets the project and reopens its space and the blog-1 and blog-2 worktrees.
2. In the `blog` space, narrow the panel's list with the **Label** dropdown.
3. **Start** "Add tags to posts" from the panel. It opens the issue's worktree in a new space with a Claude session working it.
4. Remove the worktree of "Fix broken links on the archive page" (blog-1), whose branch is already merged into main, so it is ready to close: open the worktree dialog for its space, for example with **Remove worktree** in the space's menu, and remove it. See [Removing a worktree](docs/using-the-panel.md#removing-a-worktree).
