---
name: config
description: Choose where a repository's issues are tracked (a Linear team, GitHub Issues or a local Beads database) and how its work lands in main (its merge and complete settings), by writing its entry in the Herdr app's issues.json, which the issues panel and the other issues skills read, and check the credentials that tracker needs, or set the command run in each new worktree. Use when asked to configure, set up or change a repository's issue tracker or how its work is merged, for example "/issues:config", "track this repo's issues in Linear", "set up issues for this repo", "merge this repo's work without pull requests" or "show this repo's merge setting".
argument-hint: [linear <team key> | github [owner/name] | beads | merge <auto|review|pull-request> | complete <merged|pull-request-open> | clear <merge|complete> | worktreeSetup [<command> | clear] | show]
---

Set where the current repository's issues live and how its work lands in main, from `$ARGUMENTS` or by asking, and make sure this machine can reach that tracker.

The settings are the repository's entry in `~/.config/herdr-app/issues.json`, under `repos` and keyed by its main checkout's path (the first path `git worktree list` prints), written with `~` for the home folder. Every worktree shares its repository's entry, nothing is written to the repository, and the entry wins over every other way the panel and the skills find a tracker:

```json
{
  "repos": {
    "~/Code/calendar": { "tracker": "linear", "team": "CAL", "views": { "Calendar core": "https://linear.app/…/view/…" } },
    "~/Code/app": { "tracker": "github", "repo": "owner/name", "merge": "pull-request", "complete": "merged" },
    "~/Code/notes": { "tracker": "beads", "merge": "auto" }
  }
}
```

The file holds no secrets. Linear's API key lives apart from it, in `~/.config/herdr-app/linear.json`.

`views` is optional: saved Linear views the panel offers as lists beside the team's. `repo` is optional too: without it, GitHub issues come from origin's repository.

`worktreeSetup` is optional: a shell command that `issues worktree` runs once in each new worktree it creates, through the person's login shell, before opening its space, such as `box worktree-setup` for a Planning Center box app. When it fails, the worktree is kept and no space opens. A repository whose own git hook sets up new worktrees, such as calendar, leaves it unset.

`merge` and `complete` are optional, and say how an issue's branch gets into main and when its work counts as complete. Explain them in these words when you ask about them or show them:

- `merge`:
  - `auto`: the branch merges into main on this computer as soon as its work is done.
  - `review`: the branch merges into main on this computer once the person approves it.
  - `pull-request`: the branch lands in main through a pull request.
  - Without it, `pull-request` when origin is on GitHub, else `review`.
- `complete`: when a session can finish and the issue's worktree is safe to remove.
  - `pull-request-open`: once the branch is pushed with an open pull request, while it waits for review.
  - `merged`: once the branch is in main.
  - It applies only with `merge: "pull-request"`, where `pull-request-open` is its default; with `auto` or `review`, the work is complete once merged. Refuse `complete: "pull-request-open"` with `auto` or `review`, saying why.

`issues setting merge` and `issues setting complete`, run in the repository, print the settings with their defaults applied.

1. **Read the current state.** Read the repository's entry in `issues.json`, if any; in the main checkout, read `git remote get-url origin`, `issues tracker --json`, `issues setting merge` and `issues setting complete`. Say what the repository uses today: its tracker, from `issues tracker`'s `kind` with its `team` or `repo` (or what it printed when it fails, such as that the repository has no tracker), and how work lands, saying which settings are set and which are defaults. For `show`, stop here.
2. **Choose what to change.**
   - `merge <value>`, `complete <value>` or `clear <key>` change only that setting: go to step 5.
   - When the person only asks about `worktreeSetup`, keep the current tracker and go to step 6.
   - Otherwise choose the tracker. Use the arguments when they name one. Otherwise ask with AskUserQuestion, offering the tracker the repository already uses first, marked Recommended:
     - **Linear**: a Linear team. Load `list_teams` with ToolSearch (prefixed `mcp__linear__` or `mcp__claude_ai_Linear__`) and offer the teams, with the `team` from step 1 first. Ask whether to add any saved views, and take their URLs from the person.
     - **GitHub**: the repository's GitHub Issues. Offer origin's repository (`gh repo view --json nameWithOwner,hasIssuesEnabled`) and leave `repo` out when it's that one; if issues are disabled there, say so.
     - **Beads**: a local [Beads](https://github.com/steveyegge/beads) database in the main checkout's `.beads/` folder, shared by every worktree and kept out of git. Its entry is `{ "tracker": "beads" }`, with no `team` or `repo`.
3. **Check the credentials.** Never print a secret, and never ask for one in chat: tell the person where to put it.
   - **Linear**: the panel reads the API key from `apiKey` in `~/.config/herdr-app/linear.json`. Check the key is present with `issues credentials linear`, which never prints it. If it fails, relay the problem and fix it prints, and tell the person to save the file with `chmod 600`. The skills reach Linear through its MCP server instead. When neither `mcp__linear__` nor `mcp__claude_ai_Linear__` tools are available, tell the person to add the server once for every project by running this command, suggesting the `! ` prefix so it runs in this session:

     ```sh
     claude mcp add --transport http --scope user linear https://mcp.linear.app/mcp
     ```

     Then they start a new Claude Code session, since a server added mid-session isn't available until one starts, run `/mcp`, choose `linear` and sign in to Linear in the browser window it opens. Say that a Linear connection on their Claude account at claude.ai works too.
   - **GitHub**: the panel and the skills run the GitHub CLI as the person. Check `issues credentials github`; if it fails, relay the problem and fix it prints, suggesting `! gh auth login` when gh isn't logged in. When gh isn't installed and the fix names install commands (`devbox global add gh`, `brew install gh`), offer to run one with AskUserQuestion, one option per command the fix names and one to install it themselves; on a yes, run that command and check again. If gh still isn't found after `devbox global add gh`, tell the person to make sure their shell profile evaluates `devbox global shellenv` and to start a new shell (and restart Claude Code from it), since devbox's global packages are on PATH only then. Then check the account can see the repository's issues (`gh issue list --repo <repo> --limit 1`).
   - **Beads**: Beads needs no credentials, only the `bd` CLI and a database in the main checkout. Check both with `issues credentials beads`; if it fails, relay the problem and fix it prints. When `bd` isn't installed and the fix names install commands (`devbox global add beads`, `brew install beads`), offer to run one as for gh, and check again. When the repository has no Beads database, offer with AskUserQuestion to make one, or to make it themselves; on a yes, run this in the main checkout, as the panel's setup view does, so the database stays out of git and `bd` adds no agent instructions or git hooks, then check again:

     ```sh
     bd init --non-interactive --quiet --skip-agents --skip-hooks --setup-exclude
     ```
4. **Choose how work lands.** When the repository had no entry, or the person asked to set up its tracker, ask how work gets into main with AskUserQuestion, offering `auto`, `review` and `pull-request` in plain labels with the explanations above, and the current value from step 1 first, marked Recommended. When they choose `pull-request`, ask when the work is complete the same way, with `pull-request-open` marked Recommended unless `complete` is already set to `merged`. When the repository already had an entry and the person only changed its tracker, keep its `merge` and `complete` without asking.
5. **Write the settings.** Change the repository's entry in `~/.config/herdr-app/issues.json`, creating the file if needed, keeping every other entry and two-space indentation. Treat an entry for the same main checkout as the repository's even when its key is written differently (`~/…` or the full path), and write it under the `~/…` key.
   - A tracker change replaces the entry's `tracker`, `team` and `repo` (a Beads entry has neither `team` nor `repo`), and keeps its other keys, such as `views`, `spaceName` and `worktreeSetup`; `merge` and `complete` are the ones chosen in step 4, or kept.
   - `merge <value>` sets `merge`. Setting `auto` or `review` also removes a `complete` of `pull-request-open`, saying so, since it no longer applies.
   - `complete <value>` sets `complete`. Refuse `pull-request-open` unless `merge` is `pull-request` or, with no `merge` set, `issues setting merge` prints `pull-request`.
   - `clear <key>` removes `merge` or `complete`, so its default applies. Clearing `merge` while `complete` is `pull-request-open` keeps `complete`, which then applies only if the default is `pull-request`; say so.
   - Refuse a value not listed above, listing the valid ones.
6. **Set the worktree setup command** when the person asks to set, show or clear it, with or without changing the tracker. Show the entry's `worktreeSetup`, or say it has none. To set it, write the command the person gives as the entry's `worktreeSetup` string; to clear it, remove the key. Keep every other key. Explain that the command runs once in each new worktree `issues worktree` creates, and that a failure keeps the worktree without opening its space.
7. **Report** the tracker the repository now uses and how its work lands, with `issues setting merge` and `issues setting complete`, and anything the person still has to do, such as saving an API key. The issues panel picks the change up on its next refresh.
