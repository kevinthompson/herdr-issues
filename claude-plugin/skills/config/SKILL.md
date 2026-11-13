---
name: config
description: Choose where a repository's issues are tracked (its issues/ folder or a Linear team) by writing an untracked .issues.json that the Herdr issues panel and the other issues skills read, and check the credentials that tracker needs. Use when asked to configure, set up or change a repository's issue tracker, for example "/issues:config", "track this repo's issues in Linear" or "set up issues for this repo".
argument-hint: [local | linear <team key>]
---

Set where the current repository's issues live, from `$ARGUMENTS` or by asking, and make sure this machine can reach that tracker.

The setting is `.issues.json` in the repository's main checkout (the first path `git worktree list` prints). Every worktree shares it, git ignores it through the repository's `info/exclude`, and it wins over every other way the panel and the skills find a tracker:

```json
{ "tracker": "local" }
{ "tracker": "linear", "team": "CAL", "views": { "Calendar core": "https://linear.app/…/view/…" } }
```

`views` is optional: saved Linear views the panel offers as lists beside the team's.

1. **Read the current state.** In the main checkout, read any existing `.issues.json`, check for an `issues/` folder, and read `git remote get-url origin`. Say what the repository uses today: its setting, else its `issues/` folder, else Linear for a `planningcenter` repository, else nothing.
2. **Choose the tracker.** Use the arguments when they name one. Otherwise ask with AskUserQuestion, offering the tracker the repository already uses first, marked Recommended:
   - **Local**: Markdown files in the repository's `issues/` folder.
   - **Linear**: a Linear team. Load `list_teams` with ToolSearch (prefixed `mcp__linear__` or `mcp__claude_ai_Linear__`) and offer the teams; for a `planningcenter` repository, offer the team that owns it first. Ask whether to add any saved views, and take their URLs from the person.
3. **Check the credentials.** Never print a secret, and never ask for one in chat: tell the person where to put it.
   - **Local**: nothing to check. When the repository has no `issues/` folder, set one up as `../create/SKILL.md` step 1 describes for "Neither" (read it beside this skill).
   - **Linear**: the panel reads the API key from `apiKey` in `~/.config/herdr-app/linear.json`. Check the key is present without showing it (`jq -e '.apiKey | length > 0' ~/.config/herdr-app/linear.json`). If it's missing, tell the person to create a personal API key in Linear under Settings → Account → Security & access, and save it there as `{ "apiKey": "lin_api_…" }`, keeping any `repos` already in the file. The skills reach Linear through its MCP server instead: if the Linear tools aren't available, tell the person to add the Linear MCP server to Claude Code.
4. **Write the setting.** Write `.issues.json` in the main checkout, two-space indented. Add `/.issues.json` to the repository's exclude file (`$(git rev-parse --git-common-dir)/info/exclude`) unless it's already there, so it never shows as an untracked change. Don't commit anything.
5. **Report** the tracker the repository now uses, and anything the person still has to do, such as saving an API key. The issues panel picks the change up on its next refresh.
