# Herdr Issues

https://github.com/user-attachments/assets/f4b5b476-f7ec-4f8a-888d-986df11839e8

An Issues panel for the Herdr desktop app and a Claude Code plugin that work as one. The panel lists the issues of the repository in the focused pane, from Linear, GitHub Issues or a local Beads database. The plugin's `issues:*` skills write and refine those issues, and Claude works each one in its own worktree until its branch is merged.

## How they work together

1. **Write the issues.** `/issues:plan` turns an idea, a brief or a full spec into a series of issues by interviewing you, and `/issues:create` writes issues for work that is already settled. `/issues:triage` rewrites existing issues until each is a self-contained hand-off.
2. **See them in the panel.** The panel lists the new issues, grouped by status, where you can read them, edit them and change their status and priority.
3. **Start one.** **Start** opens the issue's branch in a new worktree, shown as a Herdr space nested under the repository's space, with a Claude session running `/issues:work` on the issue. `/issues:start` does the same from a Claude session, for one issue, several, or the next few that are ready.
4. **Claude works it.** `/issues:work` catches up on any work already on the branch, marks the issue in progress, does the work and verifies it.
5. **Merge it or open its pull request.** As the repository's [approval settings](docs/configuration.md#approval-onapproval-and-waitforchecks) say, the session asks you to approve the work or goes straight on, then merges the branch into main or opens its pull request.

Claude sessions in Herdr know which issues the panel lists and which one is open, so "the issues" and "this issue" mean what you see.

```
/issues:plan make the collapsed panel show something useful
/issues:create show a tooltip when hovering the panel toggle button
/issues:triage #42
/issues:start next 2
/issues:work #42
```

## Install

You need [Herdr](https://herdr.dev/), opened at least once, `git` and Node.js 22.15 or later. [Claude Code](https://claude.com/product/claude-code) is needed only for the `issues:*` skills; the panel works without it. [Installation](docs/installation.md#requirements) lists what each tracker needs.

```sh
curl -fsSL https://raw.githubusercontent.com/kevinthompson/herdr-issues/main/bootstrap | bash
```

Run the same command again to update. Start a new Claude Code session to load the plugin. In Herdr, **Cmd-Shift-I** collapses or expands the Issues panel, and **Cmd-R** refreshes its list while it's focused.

## Configure

A repository with no tracker shows a setup view in the panel: choose **GitHub Issues**, **Linear** or **Beads**, and how work gets into main. The panel checks what that tracker needs and says how to fix anything missing. Once it's set up, the gear in the panel's header opens its settings, for the focused repository or for all of them. `/issues:config` covers the options the panel doesn't offer.

The panel keeps a Linear API key in `~/.config/herdr-app/linear.json`, the file other Herdr mods that call Linear read too. If your dotfiles repository tracks `~/.config/herdr-app/`, add `linear.json` to its `.gitignore` so you never commit the key.

## Remove

```sh
~/.local/share/herdr-issues/uninstall
```

It asks before removing the panel from your layouts and deleting your settings and Linear API key.

## Further reading

- [Installation](docs/installation.md): requirements, what the install command changes, updating, checking the mod loads and removing it.
- [Configuration](docs/configuration.md): choosing a tracker, credentials and every `issues.json` setting.
- [Using the panel](docs/using-the-panel.md): scopes and labels, an issue's detail view, starting work and removing a worktree.
- [Claude skills](docs/skills.md): every `issues:*` skill and its arguments.
- [Contributing](CONTRIBUTING.md): setting up for development, checking and committing a change, and recording the demo.

## License

[MIT](LICENSE)
