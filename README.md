# Herdr Issues

![A demo of the Issues panel in the Herdr app](docs/screenshots/demo.gif)

## What it is

An Issues panel for the Herdr desktop app, and a Claude Code plugin that works the same issues from Claude sessions.

- **Your issues beside your terminals.** The Herdr mod's Issues panel lists the issues of the repository in the focused pane, from Linear, GitHub Issues or a local Beads database, and lets you read and edit them in place.
- **One click to start.** **Start** opens an issue's branch in its own worktree and Herdr space, with Claude already working the issue.
- **Claude knows what you're looking at.** Claude sessions in Herdr know which issues the panel lists and which one is open, so "the issues" and "this issue" mean what you see.
- **Skills for the whole loop.** The Claude Code plugin's `issues:*` skills create, plan, triage and work issues in whichever tracker the repository uses.

## Getting started

You need:

- Herdr, opened at least once
- Claude Code
- `git`, with access to the GitHub repository
- Node.js 22.15 or later
- the [GitHub CLI](https://cli.github.com) (`gh`), for repositories tracked in GitHub Issues
- the Linear MCP server in Claude Code, for repositories tracked in Linear
- [Beads](https://github.com/steveyegge/beads) (`bd`, `brew install beads`), for repositories tracked locally with Beads

Install with one command:

```sh
d="$HOME/.local/share/herdr-issues-mod"; [ -d "$d" ] || git clone https://github.com/kevinthompson/herdr-issues-mod.git "$d" && "$d/install"
```

It clones the repository into `~/.local/share/herdr-issues-mod` and runs its setup. Run the same command again to update.

Start a new Claude Code session to load the plugin, then press **Cmd-Shift-I** in Herdr to collapse the Issues panel to a thin strip or expand it again; the strip's button expands it too.

### Linear

The `issues:*` skills reach Linear through Linear's MCP server, so add it to Claude Code once for every project:

```sh
claude mcp add --transport http --scope user linear https://mcp.linear.app/mcp
```

Then start a Claude Code session, run `/mcp`, choose `linear` and sign in to Linear in the browser window it opens. If Linear is connected to your Claude account at claude.ai instead, its tools are already available and the skills use them.

The panel also needs a personal Linear API key; [Configuration](docs/configuration.md#credentials) explains creating it.

[Installation](docs/installation.md) explains what the install command changes and how to update.

## Configuration

The panel shows a setup view for a repository whose tracker it can't place: choose **GitHub Issues** or **Linear**, and how work gets into main. For options the panel doesn't offer, run `/issues:config` in a Claude Code session in the repository.

Each tracker needs credentials:

- **Linear**: a personal API key in `~/.config/herdr-app/linear.json`, and the Linear MCP server in Claude Code.
- **GitHub**: a signed-in GitHub CLI (`gh auth login`).
- **Beads**: none; it needs `bd` installed and a database made with `bd init` in the repository. The setup view doesn't offer Beads yet, so add `{ "tracker": "beads" }` as the repository's entry in `issues.json` by hand. The panel lists its issues and edits their status, priority and body, and none of it makes a git commit. The `issues:*` skills don't work Beads issues yet.

[Configuration](docs/configuration.md) covers creating the Linear key and every setting in `issues.json`.

## Further reading

- [Installation](docs/installation.md): requirements, what the install command changes, updating and checking the mod loads.
- [Configuration](docs/configuration.md): choosing a tracker, credentials and the `issues.json` settings.
- [Using the panel](docs/using-the-panel.md): scopes and labels, an issue's detail view, starting work and removing a worktree.
- [Claude skills](docs/skills.md): the `issues:*` skills.
- [Contributing](CONTRIBUTING.md): setting up for development, checking and committing a change, and recording the demo.
- [AGENTS.md](AGENTS.md): how the repository is laid out, how to install it for development, how changes reach the running app and Claude Code, and the checks to run before committing.
