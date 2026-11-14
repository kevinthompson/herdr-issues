---
name: config
description: Choose where a repository's issues are tracked (a Linear team or GitHub Issues) by writing its entry in the Herdr app's issues.json, which the issues panel and the other issues skills read, and check the credentials that tracker needs. Use when asked to configure, set up or change a repository's issue tracker, for example "/issues:config", "track this repo's issues in Linear" or "set up issues for this repo".
argument-hint: [linear <team key> | github [owner/name]]
---

Set where the current repository's issues live, from `$ARGUMENTS` or by asking, and make sure this machine can reach that tracker.

The setting is the repository's entry in `~/.config/herdr-app/issues.json`, under `repos` and keyed by its main checkout's path (the first path `git worktree list` prints), written with `~` for the home folder. Every worktree shares its repository's entry, nothing is written to the repository, and the entry wins over every other way the panel and the skills find a tracker:

```json
{
  "repos": {
    "~/Code/calendar": { "tracker": "linear", "team": "CAL", "views": { "Calendar core": "https://linear.app/…/view/…" } },
    "~/Code/app": { "tracker": "github", "repo": "owner/name" }
  }
}
```

The file holds no secrets. Linear's API key lives apart from it, in `~/.config/herdr-app/linear.json`.

`views` is optional: saved Linear views the panel offers as lists beside the team's. `repo` is optional too: without it, GitHub issues come from origin's repository.

1. **Read the current state.** Read the repository's entry in `issues.json`, if any; in the main checkout, read `git remote get-url origin`. Say what the repository uses today: its setting, else Linear for a `planningcenter` repository, else nothing.
2. **Choose the tracker.** Use the arguments when they name one. Otherwise ask with AskUserQuestion, offering the tracker the repository already uses first, marked Recommended:
   - **Linear**: a Linear team. Load `list_teams` with ToolSearch (prefixed `mcp__linear__` or `mcp__claude_ai_Linear__`) and offer the teams; for a `planningcenter` repository, offer the team that owns it first. Ask whether to add any saved views, and take their URLs from the person.
   - **GitHub**: the repository's GitHub Issues. Offer origin's repository (`gh repo view --json nameWithOwner,hasIssuesEnabled`) and leave `repo` out when it's that one; if issues are disabled there, say so.
3. **Check the credentials.** Never print a secret, and never ask for one in chat: tell the person where to put it.
   - **Linear**: the panel reads the API key from `apiKey` in `~/.config/herdr-app/linear.json`. Check the key is present without showing it (`jq -e '.apiKey | length > 0' ~/.config/herdr-app/linear.json`). If it's missing, tell the person to create a personal API key in Linear under Settings → Account → Security & access, and save it there as `{ "apiKey": "lin_api_…" }` with `chmod 600`. The skills reach Linear through its MCP server instead: if the Linear tools aren't available, tell the person to add the Linear MCP server to Claude Code.
   - **GitHub**: the panel and the skills run the GitHub CLI as the person. Check `gh auth status`; if it fails, tell the person to run `! gh auth login`. Then check the account can see the repository's issues (`gh issue list --repo <repo> --limit 1`).
4. **Write the setting.** Set the repository's tracker in its entry in `~/.config/herdr-app/issues.json`, creating the file if needed, keeping every other entry and two-space indentation. Replace the entry's `tracker`, `team` and `repo`, and keep its other keys, such as `views`, `spaceName`, `merge` and `complete`. Treat an entry for the same main checkout as the repository's even when its key is written differently (`~/…` or the full path), and write it under the `~/…` key.
5. **Report** the tracker the repository now uses, and anything the person still has to do, such as saving an API key. The issues panel picks the change up on its next refresh.
