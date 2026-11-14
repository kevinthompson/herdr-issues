# Installation

## Requirements

- Herdr (`herdr-app`), opened at least once so `~/.config/herdr-app/keys.json` exists
- Claude Code (`claude`)
- `jq`
- `git`
- Node.js (`node`) 22.15 or later, for the `issues` command
- the [GitHub CLI](https://cli.github.com) (`gh`), for repositories tracked in GitHub Issues

## Running setup

Clone the repository and run its setup script:

```sh
git clone https://github.com/kevinthompson/herdr-issues-mod.git
cd herdr-issues-mod
./setup
```

The script:

- links the checkout's `mod/` folder, which holds the panel, to `~/.config/herdr-app/mods/issues`, where Herdr loads it;
- adds the panel's keys to `~/.config/herdr-app/keys.json`, keeping any key you already bound to something else;
- adds the checkout as the `herdr-issues` plugin marketplace and installs the `issues@herdr-issues` plugin;
- offers to add the Issues panel to the side panel of one of your layouts, or of a new copy of Herdr's `main` layout. Herdr's shipped layouts can't be changed, so it never edits them;
- links the `issues` command to `~/.local/bin/issues`, warning if that folder isn't on your `PATH`.

If you skipped the layout step or ran setup without a terminal, run `./setup` again, or follow the steps it printed.

Start a new Claude Code session afterwards to load the plugin.

## Updating

Running `./setup` again is safe; it is also how you update after pulling.

## Checking the mod loads

To confirm the mod loads, run:

```sh
herdr-app check ~/.config/herdr-app/mods/issues
```
