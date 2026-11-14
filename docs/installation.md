# Installation

## Requirements

- Herdr (`herdr-app`), opened at least once so `~/.config/herdr-app/keys.json` exists
- Claude Code (`claude`)
- `git`, with access to the GitHub repository
- Node.js (`node`) 22.15 or later, for the `issues` command
- the [GitHub CLI](https://cli.github.com) (`gh`), for repositories tracked in GitHub Issues
- the Linear MCP server in Claude Code, for repositories tracked in Linear; [Configuration](configuration.md#credentials) explains adding it

## Installing

Run this command:

```sh
d="$HOME/.local/share/herdr-issues-mod"; [ -d "$d" ] || git clone https://github.com/kevinthompson/herdr-issues-mod.git "$d" && "$d/install"
```

It clones the repository into `~/.local/share/herdr-issues-mod` when it isn't there, then runs that checkout's `install` script, which brings it up to date with `origin/main` and runs its `setup` script. Keep the folder: Herdr loads the panel, the `issues` command and the Claude plugin from it.

If the Issues panel is already linked to another clone, such as one you develop in, the command says so and asks before pointing everything at `~/.local/share/herdr-issues-mod`; without a terminal to ask in, it changes nothing.

The setup script:

- links the checkout's `mod/` folder, which holds the panel, to `~/.config/herdr-app/mods/issues`, where Herdr loads it;
- adds the panel's keys to `~/.config/herdr-app/keys.json`, keeping any key you already bound to something else;
- adds the checkout as the `herdr-issues` plugin marketplace and installs the `issues@herdr-issues` plugin;
- offers to add the Issues panel beside the side panel of one of your layouts, or of a new copy of Herdr's `main` layout. Herdr's shipped layouts can't be changed, so it never edits them;
- links the `issues` command to `~/.local/bin/issues`, warning if that folder isn't on your `PATH`.

If you skipped the layout step or ran setup without a terminal, run `./setup` again, or follow the steps it printed.

Setup puts the Issues panel in a column of its own beside the side panel that holds Files and Changes, so collapsing it to a strip leaves them as they are. When a layout an earlier setup prepared has the panel inside that side panel, setup moves it into its own column, and rebinds **Cmd-Shift-I** from showing and hiding the side panel to collapsing and expanding the Issues panel, unless you bound that key to something else.

Start a new Claude Code session afterwards to load the plugin.

## Updating

Run the install command again. It fast-forwards `~/.local/share/herdr-issues-mod` to `origin/main` and runs setup again. When that checkout has local changes, isn't on `main` or has commits `origin/main` doesn't, it stops and says so, changing nothing.

If you develop in your own clone, run `./setup` in it instead, after pulling; running it again is safe.

## Checking the mod loads

To confirm the mod loads, run:

```sh
herdr-app check ~/.config/herdr-app/mods/issues
```
