---
name: triage
description: Triage issues in Linear, in GitHub Issues or in a local Beads database, making each one small and actionable enough to hand to an agent. Use when asked to triage, groom, refine or review issues, the backlog or Linear's triage queue, for example "triage <issue ID>", "triage the backlog" or "let's triage".
argument-hint: [issue IDs, a status, or what to triage]
---

Bring the issues named in `$ARGUMENTS`, or picked as below, up to the bar `/issues:create` sets: each one is a self-contained hand-off, scoped to one branch and one pull request, that an agent holding only the issue and the repository could finish and know it had finished. Triage never adds labels to sort issues; the bar is the same for every issue.

1. **Find the tracker** as `/issues:create` step 1 does, with `issues tracker --json`.
   - **Linear**: load `list_issues`, `get_issue`, `save_issue`, `list_issue_statuses`, `list_issue_labels` and the comment tools (`list_comments`, `save_comment` or `create_comment`) with ToolSearch, prefixed `mcp__linear__` or `mcp__claude_ai_Linear__`. Use the team that owns the repository. If the tools aren't available, stop and say so.
   - **GitHub**: use the GitHub CLI against the repository the setting names: `gh issue list`, `gh issue view --comments`, `gh issue edit --body-file`, `gh issue comment` and `gh issue close`. GitHub has no priority or Backlog state, so skip the priority and status questions in step 7, and leave the issue open and unassigned; blockers are GitHub issue dependencies, listed with `gh api repos/<owner>/<name>/issues/<number>/dependencies/blocked_by`, added as `/issues:create` adds them, and removed with `gh api -X DELETE repos/<owner>/<name>/issues/<number>/dependencies/blocked_by/<id>`. Replace any "Blocked by #<number>" line in the body with the dependency.
   - **Beads**: use the `bd` CLI in the main checkout, the first path `git worktree list` prints, with `bd -C <main checkout>`, since the database lives in its `.beads/` folder and a worktree has none. First run `issues credentials beads`; if it fails, relay the problem and fix it prints, tell the person to run `/issues:config`, and stop. List issues with `bd -C <main checkout> list --json --limit 0 --status <statuses>`, read one with `bd -C <main checkout> show <id> --json --include-comments --include-dependents`, and comment with `bd -C <main checkout> comment <id> --file <file>`, the comment written to a file in the scratchpad. Blockers are `blocks` dependencies: an issue's `dependencies` whose `dependency_type` is `blocks` are its blockers and its `dependents` of that type are the issues it blocks; add one with `bd -C <main checkout> dep add <blocked ID> <blocker ID>` and remove one with `bd -C <main checkout> dep remove <blocked ID> <blocker ID>`. Replace any "Blocked by" line in the body with the dependency. Beads has priorities and a backlog, so step 7 asks both questions, mapped as the issues panel maps them: Urgent, High, Medium, Low and None are P0 to P4, and Todo and Backlog are the statuses `open` and `deferred`. Beads keeps its database out of git, so triage makes no commit.
   - Read `../create/SKILL.md` beside this skill: its step 4 is what an issue must contain, and this skill doesn't restate it.

2. **Pick the issues.** With issue IDs or a scope in the arguments, triage those. Otherwise confirm the scope before reading any issue. Triaging is this skill's job, not a list: never assume the person means Linear's Triage state.
   - **A list is in context**, such as the one the Herdr issues panel shows, which the session's context names: count that list's issues exactly as it defines them. For My issues that is every open issue assigned to the person across all teams (`list_issues` with `assignee: "me"` and no team), where open means not completed, canceled, a duplicate or in a state named Merged; In Review counts as open. Ask "There are <n> issues in <list>. What would you like to triage?" with the options **All issues** and **A different list**, and let the person type which issues they mean in the free-text answer.
   - **No list is in context**, or the person picks **A different list**: ask "Which issues would you like to triage?" with the lists as options, each with its count: for Linear, My issues, the team's Triage state and the team's other open issues by status; for GitHub, the open issues by status (Todo, In progress, In review); for Beads, the open issues by status: Backlog (`deferred`), Todo (`open` and `blocked`) and In progress (`in_progress`).
   - Triage the chosen issues oldest first.

   Work through the issues one at a time: finish each (steps 3 to 8) before starting the next.

3. **Read it in full.** The whole issue, its comments, its blockers and the issues it blocks. Note whether anyone has worked it yet: it has been worked when its status is in progress or later, its branch exists locally or on origin, or someone other than the person has commented on it or is assigned to it.

4. **Check it against the code.** Read the code its Context names, then:
   - **Already implemented**: search the code for the behavior it asks for, by concept, not only by its wording. If it's there, recommend canceling and say where it lives.
   - **Duplicates**: search the tracker's other open issues for the same work. If one exists, recommend which to keep and cancel the other with a link to it.
   - **Stale context**: check that every file, function, command and issue ID it names still exists, and find where moved ones went.

   Report what you found in a few sentences before going on.

5. **Settle what only the person can.** When the issue waits on a decision, content, or intent the code can't answer, interview the person now with focused multiple-choice questions (AskUserQuestion), a round at a time, until the issue can be written. Never invent creative or product content; when the person wants to leave it for later, name what's missing in the issue.

6. **Size it.** When the issue needs more than one branch or pull request, or has separable outcomes, propose a split: list each slice's title, goal and blockers, and ask the person to approve or adjust it before writing anything. Once approved, rewrite the original as the first slice and create the others with `/issues:create`'s format, blocked by it where they depend on it.

7. **Rewrite it.** Bring the issue to the bar: testable acceptance criteria, Out of scope, Verification commands that exist, Context naming real code and the reason for the work, and correct blockers (add or remove the Linear blocking relations, GitHub issue dependencies or Beads `blocks` dependencies the work reveals). For a bug, the first acceptance criterion reproduces it: a test or command that fails before the fix and passes after.
   - Also suggest a priority with a one-line reason, and ask the person to confirm or change it.
   - For Linear and Beads, ask which status to leave it in, Todo or Backlog, offering Todo first when nothing blocks it. An issue in Linear's Triage state always leaves Triage. Leave a Beads issue that is `in_progress` or `blocked` in its status unless the person asks to move it.
   - **Not yet worked** (step 3): rewrite the description itself.
   - **Already worked**, or others have commented: ask whether to revise the description or add a comment, since rewriting could erase what others rely on.
   - Show the person a summary of what changes and why, and save only once they approve, adjusting it first if they ask.
   - When you show the rewritten issue itself, write it straight into your reply as Markdown so the terminal renders it, never inside a code block or an HTML tag such as `<details>`, and set it off with horizontal rules.

8. **Save.**
   - **Linear**: save with `save_issue`, which replaces the whole description, so send the full rewritten text; set the state and priority the person chose, and the blocking relations. Post comments with the comment tool.
   - **GitHub**: save the body with `gh issue edit <number> --body-file <file>`, leaving the issue open and unassigned. Post comments with `gh issue comment`.
   - **Beads**: read the issue again with `bd show` first, so you don't save over edits made meanwhile, then save with `bd -C <main checkout> update <id> --body-file <file> --priority <P0–P4> --status <open or deferred>`, the full rewritten body written to a file in the scratchpad, giving only the fields that change. Add and remove its `blocks` dependencies with `bd dep`, and post comments with `bd comment`.
   - **Canceling** (already implemented, duplicate, or the person decides against it): set Linear's Canceled state, close the GitHub issue as not planned (`gh issue close <number> --reason "not planned"`), or close the Beads issue with a reason (`bd -C <main checkout> close <id> --reason "<why>"`), since Beads has no canceled status, and record why in a comment, with a link to where it lives or the issue it duplicates.

9. **Report** when the queue is done: each issue triaged, with its ID, what changed, its status and priority, and any new or canceled issues.
