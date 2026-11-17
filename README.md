# Herdr Issues

https://github.com/user-attachments/assets/f4b5b476-f7ec-4f8a-888d-986df11839e8

## What it is

An Issues panel for the Herdr desktop app and a Claude Code plugin that work as one: the plugin's skills write and refine issues, the panel lists them beside your terminals, and Claude works each one in its own worktree until its branch is merged. [How they work together](#how-they-work-together) walks through the loop.

- **Your issues beside your terminals.** The Herdr mod's Issues panel lists the issues of the repository in the focused pane, from Linear, GitHub Issues or a local Beads database, and lets you read and edit them in place.
- **Skills for the whole loop.** The Claude Code plugin's `issues:*` skills create, plan, triage and work the same issues in whichever tracker the repository uses.

## How they work together

1. **Write the issues.** `/issues:plan` turns an idea, a brief or a full spec into a series of issues by interviewing you, and `/issues:create` writes issues for work that is already settled. `/issues:triage` rewrites existing issues until each is a self-contained hand-off.
2. **See them in the panel.** The panel lists the new issues, grouped by status, where you can read them, edit them and change their status and priority.
3. **Start one.** **Start** opens the issue's branch in a new worktree, shown as a Herdr space nested under the repository's space, with a Claude session running `/issues:work` on the issue. `/issues:start` does the same from a Claude session, for one issue, several, or the next few that are ready.
4. **Claude works it.** `/issues:work` catches up on any work already on the branch, marks the issue in progress, does the work and verifies it.
5. **Merge it or open its pull request.** As the repository's [approval settings](docs/configuration.md#approval-onapproval-and-waitforchecks) say, the session asks you to approve the work or goes straight on, then merges the branch into main or opens its pull request.

Claude sessions in Herdr know which issues the panel lists and which one is open, so "the issues" and "this issue" mean what you see.

A few examples:

```
/issues:plan make the collapsed panel show something useful
/issues:create show a tooltip when hovering the panel toggle button
/issues:triage #42
/issues:start next 2
/issues:work #42
```

[Claude skills](docs/skills.md) covers every skill and its arguments.

## Quickstart

Install with one command:

```sh
curl -fsSL https://raw.githubusercontent.com/kevinthompson/herdr-issues/main/bootstrap | bash
```

Run the same command again to update.

Start a new Claude Code session to load the plugin, then press **Cmd-Shift-I** in Herdr to collapse the Issues panel to a thin strip or expand it again; the strip's button expands it too. With the panel focused, **Cmd-R** refreshes its list.

## Getting started

You need:

- [Herdr](https://herdr.dev/), opened at least once
- [Claude Code](https://claude.com/product/claude-code), only for the `issues:*` skills and the Claude hooks; the panel works without it
- `git`
- Node.js 22.15 or later
- the [GitHub CLI](https://cli.github.com) (`gh`), for repositories tracked in GitHub Issues
- the Linear MCP server in Claude Code, for repositories tracked in Linear
- [Beads](https://github.com/steveyegge/beads) (`bd`, `brew install beads`), for repositories tracked locally with Beads

### Linear

The `issues:*` skills reach Linear through Linear's MCP server, so add it to Claude Code once for every project:

```sh
claude mcp add --transport http --scope user linear https://mcp.linear.app/mcp
```

Then start a Claude Code session, run `/mcp`, choose `linear` and sign in to Linear in the browser window it opens. If Linear is connected to your Claude account at claude.ai instead, its tools are already available and the skills use them.

The panel also needs a personal Linear API key: create one on [Linear's Security & access settings](https://linear.app/settings/account/security), then paste it in the field the panel shows when you choose Linear.

[Installation](docs/installation.md) explains what the install command changes and how to update.

## Configuration

The panel shows a setup view for a repository with no tracker configured: choose **GitHub Issues**, **Linear** or **Beads**, and how work gets into main. For options the panel doesn't offer, run `/issues:config` in a Claude Code session in the repository.

Each tracker needs credentials:

- **Linear**: a personal API key, created on [Linear's Security & access settings](https://linear.app/settings/account/security) and saved from the panel's setup view, and the Linear MCP server in Claude Code.
- **GitHub**: a signed-in GitHub CLI (`gh auth login`).
- **Beads**: none; it needs `bd` installed and a database in the repository's main checkout, which the setup view and `/issues:config` offer to make with `bd init`. The panel lists its issues and edits their status, priority and body, and none of it makes a git commit. Every `issues:*` skill works its issues too.

The Claude sessions that work issues run on your own Claude Code model and effort unless `issues.json`'s `workModel` and `workEffort` set them, at the top level or in a repository's entry.

Settings at the top level of `issues.json` apply to every repository without its own: whether a session asks for approval of its work, how the branch then gets into main, whether it waits for a pull request's checks and whether main is pushed after a merge (`approval`, `onApproval`, `waitForChecks` and `pushAfterMerge`), what a finished session does about its worktree (`close`), how issue spaces are named (`spaceName`), how often the panel polls its tracker and checks for its own update (`pollSeconds` and `updateCheckHours`), and the issue sessions' model and effort. `workPrompt` is instructions appended to issue sessions' system prompt; a repository's is added after the top level's rather than replacing it. The gear in the panel's header opens its settings: **Repository** edits the focused repository's entry, and **Global** edits these top-level settings.

[Configuration](docs/configuration.md) covers creating the Linear key and every setting in `issues.json`.

## Removing

Run this command:

```sh
~/.local/share/herdr-issues/uninstall
```

It removes the panel, the `issues` command and the Claude plugin, and asks before removing the panel from your layouts and deleting your settings, Linear API key and cached lists. [Installation](docs/installation.md#removing) lists everything it removes.

## Further reading

- [Installation](docs/installation.md): requirements, what the install command changes, updating, checking the mod loads and removing it.
- [Configuration](docs/configuration.md): choosing a tracker, credentials and the `issues.json` settings.
- [Using the panel](docs/using-the-panel.md): scopes and labels, an issue's detail view, starting work and removing a worktree.
- [Claude skills](docs/skills.md): the `issues:*` skills.
- [Contributing](CONTRIBUTING.md): setting up for development, checking and committing a change, and recording the demo.
- [AGENTS.md](AGENTS.md): how the repository is laid out, how to install it for development, how changes reach the running app and Claude Code, and the checks to run before committing.

## License

[MIT](LICENSE)
