---
name: config
description: Choose where a repository's issues are tracked (a Linear team, GitHub Issues or a local Beads database), how its work lands in main (its merge and complete settings) and whether finished sessions close their worktrees (its close setting), by writing its entry in the Herdr app's issues.json, which the issues panel and the other issues skills read, and check the credentials that tracker needs, or set the command run in each new worktree, or the model and effort of the Claude sessions that work issues. Use when asked to configure, set up or change a repository's issue tracker or how its work is merged, for example "/issues:config", "track this repo's issues in Linear", "set up issues for this repo", "merge this repo's work without pull requests" or "show this repo's merge setting".
argument-hint: [linear <team key> | github [owner/name] | beads | merge <auto|review|pull-request> | complete <merged|pull-request-open> | close <ask|auto|manual> | clear <merge|complete|close|name> | name <name> | workModel <model> [--all] | workEffort <effort> [--all] | clear <workModel|workEffort> [--all] | worktreeSetup [<command> | clear] | show]
---

Set where the current repository's issues live and how its work lands in main, from `$ARGUMENTS` or by asking, and make sure this machine can reach that tracker.

The settings are the repository's entry in `~/.config/herdr-app/issues.json`, under `repos` and keyed by its main checkout's path (the first path `git worktree list` prints), written with `~` for the home folder. Every worktree shares its repository's entry, nothing is written to the repository, and the entry is how the panel and the skills find its tracker:

```json
{
  "repos": {
    "~/Code/web": { "tracker": "linear", "team": "WEB", "views": { "Checkout bugs": "https://linear.app/…/view/…" } },
    "~/Code/app": { "tracker": "github", "repo": "owner/name", "merge": "pull-request", "complete": "merged" },
    "~/Code/notes": { "tracker": "beads", "merge": "auto" }
  }
}
```

The file holds no secrets. Linear's API key lives apart from it, in the macOS Keychain.

`views` is optional: saved Linear views the panel offers as lists beside the team's. `repo` is optional too: without it, GitHub issues come from origin's repository.

`worktreeSetup` is optional: a shell command that `issues worktree` runs once in each new worktree it creates, through the person's login shell, before opening its space, such as `npm install`. When it fails, the worktree is kept and no space opens. A repository whose own git hook sets up new worktrees leaves it unset.

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

`close` is optional, in the repository's entry, and says what a finished `/issues:work` session does about its worktree. Explain it in these words:

- `ask` (the default): the session asks whether to close the worktree, and closes it if the person says yes.
- `auto`: the session closes the worktree without asking.
- `manual`: the session tells the person to close the worktree with cmd+shift+w.
- Closing waits until the session's final message is shown, then removes the worktree without a dialog only when every removal check passes; otherwise the removal dialog opens.

`issues setting close` prints it with its default applied. When the person sets `ask` or `auto`, tell them that a personal instruction telling sessions to always ask them to close worktrees with cmd+shift+w, such as one in their global `~/.claude/CLAUDE.md`, overrides this setting, and that they need to reword it for `close` to take effect. Don't change that file yourself.

`name` is optional, in the repository's entry: the name of the space `issues worktree` and the panel open on the main checkout, which the Herdr sidebar nests issue worktree spaces under. Without it, or when it's blank, the space is named after the repository without its owner: the GitHub repository's name for GitHub, else the main checkout's folder's. It names only spaces opened after it changes, and never the worktree spaces themselves, which `spaceName` names. `issues setting name` prints it with its default applied.

`workModel` and `workEffort` are optional, at the top level of `issues.json` for every repository or in the repository's entry, which wins. They choose the model and effort of the Claude sessions that work issues, which the panel's Start and Continue and `issues worktree --claude` (used by `/issues:start`) open:

- `workModel`: a model alias such as `sonnet`, `opus` or `haiku`, a model's full name, or `inherit` (the default) for the person's own Claude Code model.
- `workEffort`: `low`, `medium`, `high`, `xhigh` or `max`, or `default` (the default) for the person's own Claude Code effort.

`issues setting workModel` and `issues setting workEffort` print them with their defaults applied. A change applies to sessions started after it.

1. **Read the current state.** Read the repository's entry and the top-level settings in `issues.json`, if any; in the main checkout, read `git remote get-url origin`, `issues tracker --json`, `issues setting merge`, `issues setting complete`, `issues setting close`, `issues setting name`, `issues setting workModel` and `issues setting workEffort`. Say what the repository uses today: its tracker, from `issues tracker`'s `kind` with its `team` or `repo` (or what it printed when it fails, such as that the repository has no tracker), and how work lands, what finished sessions do about their worktrees, what its main checkout's space is named, and the model and effort issue sessions work on, saying which settings are set, where, and which are defaults. For `show`, stop here.
2. **Choose what to change.**
   - `merge <value>`, `complete <value>`, `close <value>`, `name <name>` or `clear <key>` change only that setting: go to step 5.
   - `workModel <value>`, `workEffort <value>` or `clear <workModel|workEffort>`, or a request to change the model or effort issues are worked on, change only that setting: go to step 5. They go in the repository's entry, or at the top level of `issues.json` for every repository with `--all` or when the person says so.
   - When the person only asks about `worktreeSetup`, keep the current tracker and go to step 6.
   - Otherwise choose the tracker. Use the arguments when they name one. Otherwise ask with AskUserQuestion, offering the tracker the repository already uses first, marked Recommended:
     - **Linear**: a Linear team. Load `list_teams` with ToolSearch (prefixed `mcp__linear__` or `mcp__claude_ai_Linear__`) and offer the teams, with the `team` from step 1 first. Ask whether to add any saved views, and take their URLs from the person.
     - **GitHub**: the repository's GitHub Issues. Offer origin's repository (`gh repo view --json nameWithOwner,hasIssuesEnabled`) and leave `repo` out when it's that one; if issues are disabled there, say so.
     - **Beads**: a local [Beads](https://github.com/steveyegge/beads) database in the main checkout's `.beads/` folder, shared by every worktree and kept out of git. Its entry is `{ "tracker": "beads" }`, with no `team` or `repo`.
3. **Check the credentials** of the chosen tracker by following `auth.md` beside this skill. Never print a secret, and never ask for one in chat.
4. **Choose how work lands.** When the repository had no entry, or the person asked to set up its tracker, ask how work gets into main with AskUserQuestion, offering `auto`, `review` and `pull-request` in plain labels with the explanations above, and the current value from step 1 first, marked Recommended. When they choose `pull-request`, ask when the work is complete the same way, with `pull-request-open` marked Recommended unless `complete` is already set to `merged`. When the repository already had an entry and the person only changed its tracker, keep its `merge` and `complete` without asking.
5. **Write the settings.** Change the repository's entry in `~/.config/herdr-app/issues.json`, creating the file if needed, keeping every other entry and two-space indentation. Treat an entry for the same main checkout as the repository's even when its key is written differently (`~/…` or the full path), and write it under the `~/…` key.
   - A tracker change replaces the entry's `tracker`, `team` and `repo` (a Beads entry has neither `team` nor `repo`), and keeps its other keys, such as `views`, `spaceName` and `worktreeSetup`; `merge` and `complete` are the ones chosen in step 4, or kept.
   - `merge <value>` sets `merge`. Setting `auto` or `review` also removes a `complete` of `pull-request-open`, saying so, since it no longer applies.
   - `complete <value>` sets `complete`. Refuse `pull-request-open` unless `merge` is `pull-request` or, with no `merge` set, `issues setting merge` prints `pull-request`.
   - `close <value>` sets `close`, then gives the note above about a personal instruction for `ask` and `auto`.
   - `name <name>` sets `name` to the rest of the arguments; a blank name clears it.
   - `clear <key>` removes `merge`, `complete`, `close` or `name`, so its default applies. Clearing `merge` while `complete` is `pull-request-open` keeps `complete`, which then applies only if the default is `pull-request`; say so.
   - `workModel <value>` and `workEffort <value>` set that key; `clear` removes it, so the top level's value or the default applies. A repository's entry needs a `tracker`, so when the repository has none, set them at the top level or set up its tracker first.
   - Refuse a value not listed above, listing the valid ones.
6. **Set the worktree setup command** when the person asks to set, show or clear it, with or without changing the tracker. Show the entry's `worktreeSetup`, or say it has none. To set it, write the command the person gives as the entry's `worktreeSetup` string; to clear it, remove the key. Keep every other key. Explain that the command runs once in each new worktree `issues worktree` creates, and that a failure keeps the worktree without opening its space.
7. **Report** the tracker the repository now uses and how its work lands, with `issues setting merge` and `issues setting complete`, what finished sessions do about their worktrees when it changed, with `issues setting close`, the main checkout's space's name when it changed, with `issues setting name`, the model and effort issues are worked on when either changed, with `issues setting workModel` and `issues setting workEffort`, and anything the person still has to do, such as saving an API key. The issues panel picks the change up on its next refresh.
