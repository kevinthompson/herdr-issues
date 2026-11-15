---
name: start
description: Start issues, each in its own Herdr worktree space with a Claude session working it, whether they live in Linear, in GitHub Issues or in a local Beads database. Use when asked to start one or more issues or the next few, for example "start <issue ID>", "start <ID> and <ID>" or "start the next 3 issues". To work an issue in the current session, use /issues:work.
argument-hint: <issue IDs, or "next <N>">
allowed-tools: Bash(${CLAUDE_SKILL_DIR}/start.sh:*), Bash(issues worktree:*), Bash(issues tracker:*), Bash(gh issue list:*), Bash(gh issue view:*), Bash(issues auth:*), Bash(git worktree list:*), Bash(bd -C * ready:*), mcp__linear__list_issues, mcp__linear__list_issue_statuses, mcp__claude_ai_Linear__list_issues, mcp__claude_ai_Linear__list_issue_statuses
---

Start the issues named in `$ARGUMENTS`, each in its own worktree space. This session only starts them: never mark them in progress or do any of their work here; each space's session does that with `/issues:work`.

## Started before this message

!`${CLAUDE_SKILL_DIR}/start.sh "$ARGUMENTS"`

## What to do

- **`herdr-app not found` or `issues not found`** above: say so, as the output words it, and stop.
- **Issue IDs**: the output above is `issues worktree` already run once for each issue, under a `### <issue ID>` heading. Don't run anything. Report each issue in one line: the branch it opened on (from the `opened <branch>` or `switched to the space already open on <branch>` line), or that it was refused or failed, with the reason from its output. Then stop.
- **No issue IDs given**: start the issues the conversation names, running `issues worktree <issue ID> --claude "/issues:work <issue ID>"` for each, one at a time, and report as above. If the conversation names none, ask which to start.
- **`next <N>`**: pick the N highest-ranked actionable issues: ready to start, nothing blocking them, and not waiting on a decision or content only the person can provide. `issues tracker --json` prints the repository's tracker.
  - **GitHub**: open issues with no assignee and no linked pull request, oldest first (`gh issue list --repo <repo> --state open --search "no:assignee -linked:pr sort:created-asc" --json number,title`).
  - **Linear**: the person's issues (`list_issues` with assignee `me`) in the team's unstarted state, by priority. When the context says which issues the Herdr issues panel lists, such as a project or one of its milestones, pick from that scope instead: its unstarted issues assigned to the person or to no one, by priority.
  - **Beads**: first run `issues auth beads`; if it fails, relay the problem and fix it prints, tell the person to run `/issues:config`, and stop. The Beads database every worktree shares is in the main checkout, the first path `git worktree list` prints. Take its open issues with no open blockers, by priority, from `bd -C <main checkout> ready --json --limit 0`, which already leaves out issues in progress, blocked or deferred.
  - Run `issues worktree <issue ID> --claude "/issues:work <issue ID>"` for each, one at a time; it refuses any an unfinished issue blocks. If fewer than N qualify, start those and say so. Then report as above and stop.
