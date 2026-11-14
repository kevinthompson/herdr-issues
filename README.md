# Herdr Issues

<!-- The demo GIF replaces this screenshot at docs/screenshots/demo.gif. -->
![The Issues panel listing a demo project's issues, grouped into In review, In progress and Blocked, with their labels and blockers](docs/screenshots/issues-list.png)

## What it is

An Issues panel for the Herdr desktop app, and a Claude Code plugin that works the same issues from Claude sessions.

- **Your issues beside your terminals.** The Herdr mod's Issues panel lists the issues of the repository in the focused pane, from Linear or GitHub Issues, and lets you read and edit them in place.
- **One click to start.** **Start** opens an issue's branch in its own worktree and Herdr space, with Claude already working the issue.
- **Claude knows what you're looking at.** Claude sessions in Herdr know which issues the panel lists and which one is open, so "the issues" and "this issue" mean what you see.
- **Skills for the whole loop.** The Claude Code plugin's `issues:*` skills create, plan, triage and work issues in whichever tracker the repository uses.

## Getting started

You need:

- Herdr, opened at least once
- Claude Code
- `jq` and `git`
- Node.js 22.15 or later
- the [GitHub CLI](https://cli.github.com) (`gh`), for repositories tracked in GitHub Issues

```sh
git clone https://github.com/kevinthompson/herdr-issues-mod.git
cd herdr-issues-mod
./setup
```

Start a new Claude Code session to load the plugin, then press **Cmd-Shift-I** in Herdr to show or hide the Issues panel.

[Installation](docs/installation.md) explains what `./setup` changes and how to update.

## Configuration

The panel shows a setup view for a repository whose tracker it can't place: choose **GitHub Issues** or **Linear**, and how work gets into main. For options the panel doesn't offer, run `/issues:config` in a Claude Code session in the repository.

Each tracker needs credentials:

- **Linear**: a personal API key in `~/.config/herdr-app/linear.json`, and the Linear MCP server in Claude Code.
- **GitHub**: a signed-in GitHub CLI (`gh auth login`).

[Configuration](docs/configuration.md) covers creating the Linear key and every setting in `issues.json`.

## Further reading

- [Installation](docs/installation.md): requirements, what `./setup` changes, updating and checking the mod loads.
- [Configuration](docs/configuration.md): choosing a tracker, credentials and the `issues.json` settings.
- [Using the panel](docs/using-the-panel.md): scopes and labels, an issue's detail view, starting work and removing a worktree.
- [Claude skills](docs/skills.md): the `issues:*` skills.
- [AGENTS.md](AGENTS.md): how the repository is laid out, how to install it for development, how changes reach the running app and Claude Code, and the checks to run before committing.
