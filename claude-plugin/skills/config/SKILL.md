---
name: config
description: Choose where a repository's issues are tracked (a Linear team, GitHub Issues or a local Beads database), how its work is approved and reaches main (its approval, onApproval and waitForChecks settings, and whether main is pushed after a merge, its pushAfterMerge setting) and whether finished sessions close their worktrees (its close setting), by writing its entry in the Herdr app's issues.json, which the issues panel and the other issues skills read, and check the credentials that tracker needs, or set the command run in each new worktree, or the interactive command each new issue space runs, or add, list and remove the saved Linear views the issues panel offers as lists. Use when asked to configure, set up or change a repository's issue tracker or how its work is merged, or given a Linear view's URL to add, for example "/issues:config", "track this repo's issues in Linear", "set up issues for this repo", "merge this repo's work without pull requests", "don't ask before merging", "show this repo's approval setting", "add this Linear view <url>" or "add this Linear view to the issues panel: <url>".
argument-hint: [linear <team key> | github [owner/name] | beads | view [<name>] <url> | view clear <name> | views | approval <ask|auto> [--all] | onApproval <merge|pull-request> [--all] | waitForChecks <true|false> [--all] | pushAfterMerge <true|false> [--all] | close <ask|auto> | clear <approval|onApproval|waitForChecks|pushAfterMerge|close|name> [--all] | name <name> | worktreeCommand [<command> | clear] [--all] | worktreeSetup [<command> | clear] | show]
---

Set where the current repository's issues live and how its work is approved and reaches main, from `$ARGUMENTS` or by asking, and make sure this machine can reach that tracker.

The settings are the repository's entry in `~/.config/herdr-app/issues.json`, under `repos` and keyed by its main checkout's path (the first path `git worktree list` prints), written with `~` for the home folder. Every worktree shares its repository's entry, nothing is written to the repository, and the entry is how the panel and the skills find its tracker:

```json
{
  "repos": {
    "~/Code/web": { "tracker": "linear", "team": "WEB", "views": { "Checkout bugs": "https://linear.app/…/view/…" } },
    "~/Code/app": { "tracker": "github", "repo": "owner/name", "onApproval": "pull-request", "waitForChecks": true },
    "~/Code/notes": { "tracker": "beads", "approval": "auto", "onApproval": "merge" }
  }
}
```

Linear's API key lives apart from it, in `~/.config/herdr-app/linear.json` or the `LINEAR_API_KEY` environment variable.

`views` is optional: saved Linear views the panel offers as lists beside the team's, a map from each view's name, the label the panel's list dropdown shows, to the view's URL (`https://linear.app/<workspace>/view/<slug>-<id>`). Only a `linear` entry has it. `repo` is optional too: without it, GitHub issues come from origin's repository.

`worktreeSetup` is optional: a shell command that `issues worktree` runs once in each new worktree it creates, through the person's login shell, before opening its space, such as `npm install`. When it fails, the worktree is kept and no space opens. A repository whose own git hook sets up new worktrees leaves it unset.

`approval`, `onApproval`, `waitForChecks` and `pushAfterMerge` are optional, and say how an issue's branch is approved and reaches main. Explain them in these words when you ask about them or show them:

- `approval`: whether the session asks the person to approve the work.
  - `ask` (the default): the session summarizes its commits and changed files and waits for the person's approval before it merges or opens a pull request.
  - `auto`: the session merges or opens a pull request as soon as its work is verified.
- `onApproval`: how the branch reaches main once approved.
  - `merge`: the branch merges into main on this computer.
  - `pull-request`: the session pushes the branch and opens a pull request. A branch pushed with an open pull request counts as safe to remove.
  - Without it, `pull-request` when origin is on GitHub, else `merge`.
- `waitForChecks`: `true` or `false` (the default). With `onApproval: "pull-request"`, whether the session stays until the pull request's checks pass before it hands off. It has no effect with `merge`.
- `pushAfterMerge`: `true` or `false` (the default). With `onApproval: "merge"`, whether merging the branch then pushes main to the remote it tracks. When the push fails, the merge and the issue's done status stay. It has no effect with `pull-request`, which already pushes the branch.

`issues setting approval`, `issues setting onApproval`, `issues setting waitForChecks` and `issues setting pushAfterMerge`, run in the repository, print the settings with their defaults applied.

The retired `merge` and `complete` keys still apply where `approval`, `onApproval` and `waitForChecks` aren't set: `merge: "auto"` means `approval: "auto"` and `onApproval: "merge"`; `"review"` means `"ask"` and `"merge"`; `"pull-request"` means `onApproval: "pull-request"`; `complete: "pull-request-passing"` means `waitForChecks: true`, and its other values `false`. Never write `merge` or `complete`. When step 1 finds them, show them as what they mean.

`approval`, `onApproval`, `waitForChecks`, `pushAfterMerge`, `close`, `spaceName` and `worktreeCommand` can also go at the top level of `issues.json`, beside `repos`, for every repository: a repository's own value wins, then the top level's, then the default. The panel's settings view edits the top level under **Global**; when step 1 shows a setting, say whether it comes from the repository's entry or the top level.

`close` is optional, in the repository's entry or at the top level, and says what a finished `/issues:work` session does about its worktree. Explain it in these words:

- `ask` (the default): the session asks whether to close the worktree, and closes it if the person says yes.
- `auto`: the session closes the worktree without asking.
- The retired `manual` is read as `ask`. Never write it; when step 1 finds it, show it as `ask`.
- Closing waits until the session's final message is shown, then removes the worktree without a dialog only when every removal check passes; otherwise the removal dialog opens.

`issues setting close` prints it with its default applied. When the person sets `ask` or `auto`, tell them that a personal instruction telling sessions to always ask them to close worktrees with cmd+shift+w, such as one in their global `~/.claude/CLAUDE.md`, overrides this setting, and that they need to reword it for `close` to take effect. Don't change that file yourself.

`name` is optional, in the repository's entry: the name of the space `issues worktree` and the panel open on the main checkout, which the Herdr sidebar nests issue worktree spaces under. Without it, or when it's blank, the space is named after the repository without its owner: the GitHub repository's name for GitHub, else the main checkout's folder's. It names only spaces opened after it changes, and never the worktree spaces themselves, which `spaceName` names. `issues setting name` prints it with its default applied.

`worktreeCommand` is optional, at the top level of `issues.json` for every repository or in the repository's entry, which wins: an interactive shell command that each new issue space the panel's Start and Continue open runs in its tab, such as `claude --model sonnet "/issues:work <issueId>"`, where `<issueId>` stands for the issue's ID. Without it, the space opens a shell. It runs through the person's login shell, and the tab stays a shell once it exits. Quote `<issueId>`, since a GitHub ID such as `#41` would otherwise start a shell comment. `issues worktree --claude`, which `/issues:start` uses, opens a plain Claude session instead. `issues setting worktreeCommand` prints the command that applies, or nothing. The retired `workModel`, `workEffort` and `workPrompt` keys are ignored: put the model, effort and any appended prompt in the command, as `claude` flags, instead. Never write them.

1. **Read the current state.** Read the repository's entry and the top-level settings in `issues.json`, if any; in the main checkout, read `git remote get-url origin`, `issues tracker --json`, `issues setting approval`, `issues setting onApproval`, `issues setting waitForChecks`, `issues setting pushAfterMerge`, `issues setting close`, `issues setting name` and `issues setting worktreeCommand`. Say what the repository uses today: its tracker, from `issues tracker`'s `kind` with its `team` or `repo` (or what it printed when it fails, such as that the repository has no tracker), and its approval settings, what finished sessions do about their worktrees, what its main checkout's space is named, and the command new issue spaces run, saying which settings are set, where, and which are defaults. For a `linear` entry, list its views, each name with its URL, or say it has none. For `show` and `views`, stop here.
2. **Choose what to change.**
   - `view [<name>] <url>`, `view clear <name>`, or a request to add or remove a saved Linear view, such as a Linear view URL given with no other request, change only the entry's `views`: go to step 7.
   - `approval <value>`, `onApproval <value>`, `waitForChecks <value>`, `pushAfterMerge <value>`, `close <value>`, `name <name>` or `clear <key>` change only that setting: go to step 5. The first four, and clearing them, go in the repository's entry, or at the top level with `--all` or when the person says so.
   - `worktreeCommand <command>` or `worktreeCommand clear`, or a request to change what new issue spaces run, such as the agent, model or effort issues are worked on, change only that setting: go to step 5. It goes in the repository's entry, or at the top level of `issues.json` for every repository with `--all` or when the person says so. `worktreeCommand` alone shows it, as step 1 does.
   - When the person only asks about `worktreeSetup`, keep the current tracker and go to step 6.
   - Otherwise choose the tracker. Use the arguments when they name one. Otherwise ask with AskUserQuestion, offering the tracker the repository already uses first, marked Recommended:
     - **Linear**: a Linear team. Load `list_teams` with ToolSearch (prefixed `mcp__linear__` or `mcp__claude_ai_Linear__`) and offer the teams, with the `team` from step 1 first. Ask whether to add any saved views, and take their URLs from the person.
     - **GitHub**: the repository's GitHub Issues. Offer origin's repository (`gh repo view --json nameWithOwner,hasIssuesEnabled`) and leave `repo` out when it's that one; if issues are disabled there, say so.
     - **Beads**: a local [Beads](https://github.com/steveyegge/beads) database in the main checkout's `.beads/` folder, shared by every worktree and kept out of git. Its entry is `{ "tracker": "beads" }`, with no `team` or `repo`.
3. **Check the credentials** of the chosen tracker by following `auth.md` beside this skill. Never print a secret, and never ask for one in chat.
4. **Choose approval.** When the repository had no entry, or the person asked to set up its tracker, ask about approval with one AskUserQuestion call: "How is work approved?", offering `ask` as "Ask me" and `auto` as "Automatically", and "When work is approved...", offering `merge` and `pull-request`, each in plain labels with the explanations above and the current value from step 1 first, marked Recommended. When they choose `pull-request`, ask whether to wait for the pull request's checks the same way, with the current `waitForChecks` marked Recommended; when they choose `merge`, ask whether to push main after merging the same way, with the current `pushAfterMerge` marked Recommended. Write only the one asked about, and remove the other from the entry. When the repository already had an entry and the person only changed its tracker, keep its approval settings without asking.
5. **Write the settings.** Change the repository's entry in `~/.config/herdr-app/issues.json`, creating the file if needed, keeping every other entry and two-space indentation. Treat an entry for the same main checkout as the repository's even when its key is written differently (`~/…` or the full path), and write it under the `~/…` key.
   - A tracker change replaces the entry's `tracker`, `team` and `repo` (a Beads entry has neither `team` nor `repo`), and keeps its other keys, such as `views`, `spaceName` and `worktreeSetup`; `approval`, `onApproval`, `waitForChecks` and `pushAfterMerge` are the ones chosen in step 4, or kept.
   - Whenever you write `approval`, `onApproval` or `waitForChecks` in the entry or the top level, first replace a `merge` or `complete` there with the new keys they mean, as above, unless that place already sets those keys, then remove `merge` and `complete`, so nothing else changes meaning.
   - `approval <value>`, `onApproval <value>`, `waitForChecks <value>` and `pushAfterMerge <value>` set that key. `waitForChecks` and `pushAfterMerge` are written as a JSON `true` or `false`. When the `onApproval` that applies is `merge`, say `waitForChecks` has no effect until it's `pull-request`; when it is `pull-request`, say `pushAfterMerge` has no effect until it's `merge`.
   - `close <value>` sets `close`, then gives the note above about a personal instruction for `ask` and `auto`.
   - `name <name>` sets `name` to the rest of the arguments; a blank name clears it.
   - `clear <key>` removes `approval`, `onApproval`, `waitForChecks`, `pushAfterMerge`, `close` or `name`, so the top level's value or its default applies. Clearing one of the first three replaces a retired `merge` or `complete` first, as above, and then removes the meaning being cleared too.
   - `worktreeCommand <command>` sets it to the rest of the arguments, as one string; `worktreeCommand clear` removes it, so the top level's command or a shell applies. A repository's entry needs a `tracker`, so when the repository has none, set it at the top level or set up its tracker first. When the entry or the top level being written holds the retired `workModel`, `workEffort` or `workPrompt`, offer to fold them into the command as `claude` flags and remove them.
   - Refuse a value not listed above, listing the valid ones.
6. **Set the worktree setup command** when the person asks to set, show or clear it, with or without changing the tracker. Show the entry's `worktreeSetup`, or say it has none. To set it, write the command the person gives as the entry's `worktreeSetup` string; to clear it, remove the key. Keep every other key. Explain that the command runs once in each new worktree `issues worktree` creates, and that a failure keeps the worktree without opening its space.
7. **Add or remove a saved view** when step 2 sent you here.
   - When the repository's tracker from step 1 isn't `linear`, refuse and say why: saved views are Linear's, and the panel offers them only for a Linear team. Change nothing.
   - A view's URL is a `https://linear.app/…/view/…` link. Refuse any other URL, saying where to copy one: open the view in Linear, from **Views** in the sidebar or the team's views, and copy its link from the browser's address bar.
   - Without a name, name the view yourself. Load Linear's MCP tools with ToolSearch (prefixed `mcp__linear__` or `mcp__claude_ai_Linear__`) and, when one reads a saved view, read the view by the ID that ends its URL (`…/view/checkout-bugs-a8875271fcf5` is `a8875271fcf5`) and use its name. Otherwise, or when that fails, ask for the name with AskUserQuestion, offering the URL's slug as words (`Checkout bugs`) first, marked Recommended.
   - `view <name> <url>` adds the view under that name, replacing a view with the same name. When the entry already lists the same URL under another name, rename it instead of listing it twice.
   - `view clear <name>` removes that view; when the entry has no view by that name, list the ones it has and change nothing. Remove `views` when it ends up empty.
   - Write only the entry's `views` in `~/.config/herdr-app/issues.json`, keeping every other key and entry and two-space indentation. Say that the panel picks the change up without a restart, and that the view appears in its list dropdown under the team's name.
8. **Report** the tracker the repository now uses and its approval settings, with `issues setting approval`, `issues setting onApproval`, `issues setting waitForChecks` and `issues setting pushAfterMerge`, what finished sessions do about their worktrees when it changed, with `issues setting close`, the main checkout's space's name when it changed, with `issues setting name`, the command new issue spaces run when it changed, with `issues setting worktreeCommand`, and anything the person still has to do, such as saving an API key. The issues panel picks the change up on its next refresh.
