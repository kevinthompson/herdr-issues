# Configuration

## Choosing a tracker

A repository with no entry in `issues.json` shows a setup view in the panel: choose **GitHub Issues**, **Linear** (then a team) or **Beads**, and the panel checks what that tracker needs, asks how work gets into main (see [`merge` and `complete`](#merge-and-complete)), one question per page, then shows the choices to review and save. When a configured tracker can't load, the same view says what's wrong and how to fix it, with **Check again** and a way to choose a different tracker.

For saved Linear views, a GitHub repository other than origin's, and the other options the panel doesn't offer, run this in a Claude Code session in the repository:

```
/issues:config
```

It asks which tracker to use, checks the credentials it needs, and saves the choice in `~/.config/herdr-app/issues.json`, where the panel saves its choice too, keyed by the repository's main checkout so its worktrees share it. You can also name the tracker directly: `/issues:config linear <team key>` or `/issues:config github [owner/name]`.

## Credentials

Each tracker needs:

- **Linear**: a personal API key, created in Linear under Settings → Account → Security & access ([linear.app/settings/account/security](https://linear.app/settings/account/security)). Choosing Linear in the panel's setup view without a key shows a field for it, with a link to that page: paste the key and choose **Save key**. The panel checks the key with Linear, saves it in the macOS Keychain, where a dotfiles repository tracking `~/.config/herdr-app/` can't commit it, and moves on to choosing the team. A repository whose key goes missing or stops working shows the same field. The panel never shows the key again once it's saved. A key an earlier version saved in a file in `~/.config/herdr-app/` moves to the Keychain the first time the panel reads it, and the file goes away. On a system without the Keychain's `security` command, the panel keeps the key in that file instead, readable only by you.

  To save the key in the Keychain yourself instead, run this command, which asks for the key:

  ```sh
  security add-generic-password -U -s herdr-issues -a linear -w
  ```

  The Claude skills reach Linear through its MCP server instead, so add that to Claude Code as well, for every project:

  ```sh
  claude mcp add --transport http --scope user linear https://mcp.linear.app/mcp
  ```

  Then run `/mcp` in a Claude Code session, choose `linear` and sign in. A Linear connection on your Claude account at claude.ai works too.
- **GitHub**: a signed-in GitHub CLI (`gh auth login`).
- **Beads**: no credentials, but the `bd` CLI (`brew install beads`) and a database made with `bd init` in the repository's main checkout.

## The `issues.json` entry

`~/.config/herdr-app/issues.json` holds one entry per repository under `repos`, keyed by the path of the repository's main checkout, with `~` for your home folder. The file holds no secrets; Linear's API key stays in the macOS Keychain.

```json
{
  "repos": {
    "~/Code/web": { "tracker": "linear", "team": "WEB" },
    "~/Code/herdr-issues": { "tracker": "github" }
  }
}
```

The examples below show one entry each.

### `tracker`

`linear`, `github` or `beads`. A `linear` entry also needs `team`, the Linear team's key, and can list saved views as extra lists in `views`, each a name and the view's URL. A `github` entry can name a repository other than origin's in `repo`, as `owner/name`.

`beads` lists the issues in the repository's own [Beads](https://github.com/steveyegge/beads) database, which `bd init` makes in the main checkout's `.beads/` folder; every worktree shares it. Choose it in the panel's setup view or with `/issues:config`, which check that `bd` is installed and offer to make the database when the main checkout has none, keeping it out of git. Its entry names no team or repository:

```json
"~/Code/notes": { "tracker": "beads" }
```

Beads keeps its database out of git, so changing an issue's status, priority or body, or starting it, never makes a commit. Its statuses show as todo (`open` and `blocked`), in progress, backlog (`deferred`) and done (`closed`), and its priorities P0 to P4 as Urgent, High, Medium, Low and None.

### `spaceName`

An issue's worktree space is named after the issue's ID, such as `#41` or `CAL-2449`. To name a repository's issue spaces differently, add a `spaceName` template to its entry in `issues.json` by hand. It takes two placeholders: `<issueId>`, the issue's ID, and `<repo>`, the repository's name without its owner (the GitHub repository's name for GitHub Issues, else the main checkout's folder name). For example, this names issue #41's space `herdr-issues#41`, which tells it apart from other GitHub repositories' `#41`:

```json
"~/Code/herdr-issues": { "tracker": "github", "spaceName": "<repo><issueId>" }
```

### `merge` and `complete`

These two settings say how an issue's branch gets into main and when its work counts as complete. An issue is done once its branch is in main, whichever you choose.

- `merge`: `auto` merges the branch into main locally without waiting; `review` merges it locally once you approve; `pull-request` lands it through a pull request. Without the setting, it's `pull-request` when the repository's origin is on GitHub, else `review`.
- `complete`: when the work counts as complete, so a Claude session can stop and the issue's worktree is safe to remove. `merged` means once the branch is in main; `pull-request-open` means once the branch is pushed with an open pull request. Only `merge: "pull-request"` allows `pull-request-open`, and it's that setting's default; with `auto` or `review`, the work is complete once merged.

```json
"~/Code/herdr-issues": { "tracker": "github", "merge": "pull-request", "complete": "merged" }
```

The panel's setup view asks for both when it sets up a repository's tracker, proposing the defaults. To show, change or clear them later, run `/issues:config` in Claude. `issues setting merge` and `issues setting complete` print a repository's settings, with their defaults applied.

### `worktreeSetup`

`worktreeSetup` is a command to run in each new worktree, such as one that installs the branch's dependencies. `issues worktree` runs it once, in a worktree it has just created, before opening the worktree's space; it doesn't run again when it reuses a worktree. The command runs through your login shell (`$SHELL -lc`), so it finds the tools on your profile's `PATH` even when the Herdr app starts it, and its output is printed. When it fails, `issues worktree` says which command failed, keeps the worktree so you can finish setting it up by hand, and exits with an error without opening the space. For example, a Node app:

```json
"~/Code/web": { "tracker": "linear", "team": "WEB", "worktreeSetup": "npm install" }
```

A repository whose own git hook already sets up new worktrees leaves `worktreeSetup` unset.

You don't need `worktreeSetup` to carry your own Claude Code settings into worktrees: before it runs, `issues worktree` copies the main checkout's `.claude/settings.local.json`, which git ignores, into each worktree it creates. A worktree it reuses keeps the copy it got when it was created.

### `pollSeconds`

How often the panel asks the tracker for its list of issues, in whole seconds, 10 or more; without it, every 60 seconds. Set it at the top level of `issues.json` for every repository, or in an entry for one repository, which overrides the top level's:

```json
{
  "pollSeconds": 120,
  "repos": {
    "~/Code/herdr-issues": { "tracker": "github", "pollSeconds": 30 }
  }
}
```

### `createModel` and `createEffort`

`/issues:create` settles what the work is with you, then writes and files the issues in a background agent, so you can keep working. `/issues:plan` hands its approved breakdown to the same agent, and `/issues:triage` the new slices of an issue it splits. These two settings choose that agent's model and effort. Set them at the top level of `issues.json` for every repository, or in an entry for one repository, which overrides the top level's.

- `createModel`: `sonnet` (the default), `opus`, `haiku` or `fable`, or `inherit` to use the session's own model.
- `createEffort`: `low`, `medium`, `high`, `xhigh` or `max`, or `default` (the default) to leave the agent at its usual effort.

```json
{
  "createModel": "opus",
  "repos": {
    "~/Code/herdr-issues": { "tracker": "github", "createModel": "inherit", "createEffort": "high" }
  }
}
```

`issues setting createModel` and `issues setting createEffort` print a repository's settings, with their defaults applied, and `/issues:config` shows and changes them.

### `workModel` and `workEffort`

The panel's Start and Continue, and `/issues:start` through `issues worktree --claude`, open a Claude session that works the issue. These two settings choose that session's model and effort, at the top level or in a repository's entry, which overrides the top level's. Without them, the session runs on your own Claude Code model and effort.

- `workModel`: a model alias such as `sonnet`, `opus` or `haiku`, a model's full name, or `inherit` (the default) for your own model. It's passed to `claude --model`.
- `workEffort`: `low`, `medium`, `high`, `xhigh` or `max`, or `default` (the default) for your own effort. It's passed to `claude --effort`.

```json
{
  "workEffort": "high",
  "repos": {
    "~/Code/notes": { "tracker": "beads", "workModel": "sonnet" }
  }
}
```

`issues setting workModel` and `issues setting workEffort` print a repository's settings, with their defaults applied, and `/issues:config` shows and changes them. A change applies to sessions started after it.
