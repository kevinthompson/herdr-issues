---
name: start
description: Start issues, each in its own Herdr worktree space with a Claude session working it, whether they live in Linear, in GitHub Issues or in a local Beads database. Use when asked to start one or more issues or the next few, for example "start <issue ID>", "start <ID> and <ID>" or "start the next 3 issues". To work an issue in the current session, use /issues:work.
argument-hint: <issue IDs, or "next <N>">
allowed-tools: Bash(${CLAUDE_SKILL_DIR}/start.sh:*), Bash(issues worktree:*), Bash(issues next:*), Bash(issues show:*)
---

Start the issues named in `$ARGUMENTS`, each in its own worktree space. This session only starts them: never mark them in progress or do any of their work here; each space's session does that with `/issues:work`.

## Started before this message

!`${CLAUDE_SKILL_DIR}/start.sh "$ARGUMENTS"`

## What to do

- **`herdr-app not found` or `issues not found`** above: say so, as the output words it, and stop.
- **Issue IDs**: the output above is `issues worktree` already run once for each issue, under a `### <issue ID>` heading. Don't run anything. Report each issue in one line: the branch it opened on (from the `opened <branch>` or `switched to the space already open on <branch>` line), or that it was refused or failed, with the reason from its output. Then stop.
- **No issue IDs given**: start the issues the conversation names, running `issues worktree <issue ID> --claude "/issues:work <issue ID>"` for each, one at a time, and report as above. If the conversation names none, ask which to start.
- **`next <N>`**: pick the N highest-ranked actionable issues: ready to start, nothing blocking them, and not waiting on a decision or content only the person can provide.
  - Run `issues next <N> --json`, which prints the highest-ranked issues ready to start with nothing blocking them, best first. When the context says which issues the Herdr issues panel lists, such as a Linear project or one of its milestones, add that scope's ID: `issues next <N> <scope ID> --json`. If it fails, relay what it printed; when that names a setup problem, tell the person to run `/issues:config`, and stop.
  - Skip any issue whose body (`issues show <issue ID> --json`) says it waits on a decision or content only the person can provide, and take the next one instead: ask for a few more than N when you skip any.
  - Run `issues worktree <issue ID> --claude "/issues:work <issue ID>"` for each, one at a time; it refuses any an unfinished issue blocks. If fewer than N qualify, start those and say so. Then report as above and stop.
