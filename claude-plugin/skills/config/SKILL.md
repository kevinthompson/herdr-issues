---
name: config
description: Choose where a repository's issues are tracked (a Linear team or GitHub Issues) and how its work lands in main (its merge and complete settings), by writing its entry in the Herdr app's issues.json, which the issues panel and the other issues skills read, and check the credentials that tracker needs. Use when asked to configure, set up or change a repository's issue tracker or how its work is merged, for example "/issues:config", "track this repo's issues in Linear", "set up issues for this repo", "merge this repo's work without pull requests" or "show this repo's merge setting".
argument-hint: [linear <team key> | github [owner/name] | merge <auto|review|pull-request> | complete <merged|pull-request-open> | clear <merge|complete> | show]
---

Set where the current repository's issues live and how its work lands in main, from `$ARGUMENTS` or by asking, and make sure this machine can reach that tracker.

The settings are the repository's entry in `~/.config/herdr-app/issues.json`, under `repos` and keyed by its main checkout's path (the first path `git worktree list` prints), written with `~` for the home folder. Every worktree shares its repository's entry, nothing is written to the repository, and the entry wins over every other way the panel and the skills find a tracker:

```json
{
  "repos": {
    "~/Code/calendar": { "tracker": "linear", "team": "CAL", "views": { "Calendar core": "https://linear.app/…/view/…" } },
    "~/Code/app": { "tracker": "github", "repo": "owner/name", "merge": "pull-request", "complete": "merged" }
  }
}
```

The file holds no secrets. Linear's API key lives apart from it, in `~/.config/herdr-app/linear.json`.

`views` is optional: saved Linear views the panel offers as lists beside the team's. `repo` is optional too: without it, GitHub issues come from origin's repository.

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

1. **Read the current state.** Read the repository's entry in `issues.json`, if any; in the main checkout, read `git remote get-url origin`, `issues setting merge` and `issues setting complete`. Say what the repository uses today: its tracker (its setting, else Linear for a `planningcenter` repository, else nothing), and how work lands, saying which settings are set and which are defaults. For `show`, stop here.
2. **Choose what to change.**
   - `merge <value>`, `complete <value>` or `clear <key>` change only that setting: go to step 5.
   - Otherwise choose the tracker. Use the arguments when they name one. Otherwise ask with AskUserQuestion, offering the tracker the repository already uses first, marked Recommended:
     - **Linear**: a Linear team. Load `list_teams` with ToolSearch (prefixed `mcp__linear__` or `mcp__claude_ai_Linear__`) and offer the teams; for a `planningcenter` repository, offer the team that owns it first. Ask whether to add any saved views, and take their URLs from the person.
     - **GitHub**: the repository's GitHub Issues. Offer origin's repository (`gh repo view --json nameWithOwner,hasIssuesEnabled`) and leave `repo` out when it's that one; if issues are disabled there, say so.
3. **Check the credentials.** Never print a secret, and never ask for one in chat: tell the person where to put it.
   - **Linear**: the panel reads the API key from `apiKey` in `~/.config/herdr-app/linear.json`. Check the key is present without showing it (`jq -e '.apiKey | length > 0' ~/.config/herdr-app/linear.json`). If it's missing, tell the person to create a personal API key in Linear under Settings → Account → Security & access, and save it there as `{ "apiKey": "lin_api_…" }` with `chmod 600`. The skills reach Linear through its MCP server instead: if the Linear tools aren't available, tell the person to add the Linear MCP server to Claude Code.
   - **GitHub**: the panel and the skills run the GitHub CLI as the person. Check `gh auth status`; if it fails, tell the person to run `! gh auth login`. Then check the account can see the repository's issues (`gh issue list --repo <repo> --limit 1`).
4. **Choose how work lands.** When the repository had no entry, or the person asked to set up its tracker, ask how work gets into main with AskUserQuestion, offering `auto`, `review` and `pull-request` in plain labels with the explanations above, and the current value from step 1 first, marked Recommended. When they choose `pull-request`, ask when the work is complete the same way, with `pull-request-open` marked Recommended unless `complete` is already set to `merged`. When the repository already had an entry and the person only changed its tracker, keep its `merge` and `complete` without asking.
5. **Write the settings.** Change the repository's entry in `~/.config/herdr-app/issues.json`, creating the file if needed, keeping every other entry and two-space indentation. Treat an entry for the same main checkout as the repository's even when its key is written differently (`~/…` or the full path), and write it under the `~/…` key.
   - A tracker change replaces the entry's `tracker`, `team` and `repo`, and keeps its other keys, such as `views` and `spaceName`; `merge` and `complete` are the ones chosen in step 4, or kept.
   - `merge <value>` sets `merge`. Setting `auto` or `review` also removes a `complete` of `pull-request-open`, saying so, since it no longer applies.
   - `complete <value>` sets `complete`. Refuse `pull-request-open` unless `merge` is `pull-request` or, with no `merge` set, `issues setting merge` prints `pull-request`.
   - `clear <key>` removes `merge` or `complete`, so its default applies. Clearing `merge` while `complete` is `pull-request-open` keeps `complete`, which then applies only if the default is `pull-request`; say so.
   - Refuse a value not listed above, listing the valid ones.
6. **Report** the tracker the repository now uses and how its work lands, with `issues setting merge` and `issues setting complete`, and anything the person still has to do, such as saving an API key. The issues panel picks the change up on its next refresh.
