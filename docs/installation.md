# Installation

## Requirements

- Herdr (`herdr-app`), opened at least once so `~/.config/herdr-app/keys.json` exists
- Claude Code (`claude`), only for the `issues:*` skills and the Claude hooks; without it, setup installs the panel and the `issues` command and skips the plugin with a warning, and running setup again after installing Claude Code adds it
- `git`
- Node.js (`node`) 22.15 or later, for the `issues` command; setup offers to install it with Homebrew or devbox (see below)
- the [GitHub CLI](https://cli.github.com) (`gh`), for repositories tracked in GitHub Issues
- the Linear MCP server in Claude Code, for repositories tracked in Linear; [Configuration](configuration.md#credentials) explains adding it

## Installing

Run this command:

```sh
curl -fsSL https://raw.githubusercontent.com/kevinthompson/herdr-issues/main/bootstrap | bash
```

It downloads the repository's `bootstrap` script, which clones the repository into `~/.local/share/herdr-issues` when it isn't there, then runs that checkout's `install` script, which brings it up to date with `origin/main` and runs its `setup` script. Keep the folder: Herdr loads the panel, the `issues` command and the Claude plugin from it.

To read the scripts before running them, clone the repository yourself and run its `install` script, which does the same:

```sh
d="$HOME/.local/share/herdr-issues"; [ -d "$d" ] || git clone https://github.com/kevinthompson/herdr-issues.git "$d" && "$d/install"
```

If the Issues panel is already linked to another clone, such as one you develop in, the command says so and asks before pointing everything at `~/.local/share/herdr-issues`; without a terminal to ask in, it changes nothing.

When `node` is missing or older than 22.15, setup offers to install it before it changes anything: with devbox (`devbox global add nodejs`) when its global profile lists packages, and with Homebrew (`brew install node`) when `brew` is installed, asking which to use when both apply. It finds the new `node` and carries on. After a devbox install it warns when your shell profile doesn't evaluate `devbox global shellenv`, since Herdr and Claude Code won't find `node` until it does. Without a terminal, without either package manager, or when you decline, it installs nothing and stops.

The setup script:

- links the checkout's `mod/` folder, which holds the panel, to `~/.config/herdr-app/mods/issues`, where Herdr loads it;
- adds the panel's keys to `~/.config/herdr-app/keys.json`, keeping any key you already bound to something else;
- adds the checkout as the `herdr-issues` plugin marketplace and installs the `issues@herdr-issues` plugin;
- offers to add the Issues panel beside the side panel of one of your layouts, or of a new copy of Herdr's `main` layout. Herdr's shipped layouts can't be changed, so it never edits them;
- when the layout with the Issues panel isn't the one Herdr shows, offers to switch to it, or says how to;
- links the `issues` command to `~/.local/bin/issues`, refusing to replace a file there that isn't a link, and warning if that folder isn't on your `PATH`.

If you skipped the layout step or ran setup without a terminal, run `./setup` again, or follow the steps it printed.

Setup puts the Issues panel in a column of its own beside the side panel that holds Files and Changes, so collapsing it to a strip leaves them as they are. When a layout an earlier setup prepared has the panel inside that side panel, setup moves it into its own column, and rebinds **Cmd-Shift-I** from showing and hiding the side panel to collapsing and expanding the Issues panel, unless you bound that key to something else.

The Issues panel's `issues-panel` column has a weight of 1 beside the terminals' `main` node at 2, so the panel keeps its share of the window as the window resizes, after you drag its divider, and after you collapse it to its 32px strip and expand it again; Files and Changes keep Herdr's own sizing. Setup gives a layout an earlier setup fixed at 368px those weights.

With Claude Code installed, start a new Claude Code session afterwards to load the plugin.

## Updating

Run the install command again, or choose **Update** when the panel's footer offers one; the panel checks for an update every few hours, as [`updateCheckHours`](configuration.md#updatecheckhours) sets. The install command fast-forwards `~/.local/share/herdr-issues` to `origin/main` and runs setup again. When that checkout has local changes, isn't on `main` or has commits `origin/main` doesn't, it stops and says so, changing nothing.

If you develop in your own clone, run `./setup` in it instead, after pulling; running it again is safe.

## Checking the mod loads

To confirm the mod loads, run:

```sh
herdr-app check ~/.config/herdr-app/mods/issues
```

## Removing

Run this command:

```sh
~/.local/share/herdr-issues/uninstall
```

If you installed from your own clone with `./setup`, run `./uninstall` in it instead; it leaves the clone in place.

The uninstall script removes:

- the `~/.config/herdr-app/mods/issues` and `~/.local/bin/issues` links, when they point into the checkout it runs from; anything else at those paths stays, and it says so;
- each of the panel's keys in `~/.config/herdr-app/keys.json` that is still bound to the panel's action, keeping any you rebound;
- the `issues@herdr-issues` plugin and the `herdr-issues` plugin marketplace from Claude Code;
- `~/.local/share/herdr-issues` itself, last, when it runs from there.

It asks before each of these, and keeps them unless you answer yes:

- removing the Issues panel from your layouts that show it; Herdr's shipped layouts are never changed;
- deleting `~/.config/herdr-app/issues.json`, each repository's tracker and merge settings, along with the Linear API key a system without the macOS Keychain keeps beside it;
- deleting your Linear API key from the macOS Keychain;
- deleting the cached lists and avatars in `~/.config/herdr-app/data/issues/`.

Without a terminal to ask in, it keeps all four and prints how to remove each. Running it again is safe, and says when there is nothing left to remove.

It leaves issue worktrees in `~/.herdr/worktrees/` and their Herdr spaces, and the Linear MCP server in Claude Code; remove that with `claude mcp remove linear`.
