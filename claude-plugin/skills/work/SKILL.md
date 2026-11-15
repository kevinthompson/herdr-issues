---
name: work
description: Work an issue from start to finish, whether it lives in Linear, in GitHub Issues or in a local Beads database. Use when asked to work on, pick up, continue or finish an issue, ticket or task, or given an issue ID or Linear URL to work, for example "work on <issue ID>", "work on <issue URL>", "pick up <issue ID>" or "continue <issue ID>". To start issues in their own worktree spaces, use /issues:start.
argument-hint: <issue ID or Linear URL>
---

Work the issue named in `$ARGUMENTS` or the conversation until it is done, or until it needs a decision only the person can make.

**The `issues` CLI.** This skill runs `issues`, which `./setup` in the herdr-issues repository installs. When `command -v issues` fails, tell the person to run `./setup` from that repository, and stop.

**Outside the issue's worktree.** When the Herdr app is installed (`command -v herdr-app`) and the session isn't already in a linked worktree on the issue's branch, don't work the issue here: invoke `/issues:start <issue ID>` with the Skill tool as your first action, without loading the tracker's tools or reading the issue first, and stop once it reports. It opens the issue's worktree in its own Herdr space, where the next session works it.

**Read only the parts that apply.** This file covers the common path. Read a file beside it, in this skill's base directory, only when its case comes up:
- `beads.md` when the tracker is `beads`, whose IDs look like `<prefix>-<hash>`, such as `notes-a1b`; it replaces the Beads parts of every step below;
- `without-herdr.md` in step 4 when the Herdr app isn't installed;
- `merge-review.md` or `merge-pull-request.md` in step 10 when `issues setting merge` prints `review` or `pull-request`, and `merge-pull-request.md` in step 5 when the branch already has a pull request with review or failing checks.

**Gather context in one batch.** When the session starts in a linked worktree (its folder isn't the first path `git worktree list` prints), the Herdr panel or `issues worktree` already put it on the issue's branch. Then make every read steps 1 to 5 need in your first response, as parallel tool calls, rather than one turn at a time:
- the issue: `issues show <id> --json`, and its comments: `list_comments` (Linear) or `gh issue view <number> --repo <repo> --json comments` (GitHub);
- one shell command for the branch: `git worktree list | head -1`, `git log --oneline origin/main..HEAD`, `git diff --stat origin/main...HEAD`, and `git status --porcelain` unless the worktree's folder is under five minutes old (`[ -n "$(find . -maxdepth 0 -mmin -5)" ]`), since `issues worktree` just made it, nothing can be uncommitted, and its first status competes with the background setup;
- for a Linear issue, the current branch's pull request: `gh pr view --json number,state,url,isDraft,reviewDecision,headRefName` and `gh pr checks`, which fail harmlessly when it has none.

Then name the session's tab as step 3 says, and summarize as step 5 says. Read the full diff, review comments or the code only once the summary or the person's direction needs them.

1. **Find the issue** in the tracker `issues tracker --json` prints. If it fails, show what it printed and stop. Read the issue with `issues show <issue ID> --json`, which prints the same fields on every tracker: `title`, `status`, `body`, `labels`, `blockedBy`, `branch`, `pullRequests` and the rest. It has no comments, so read those with the tracker's own tools. If it prints `<issue ID>: not found`, stop and say so.
   - **`linear`**: Load `list_comments` and the comment tool (`save_comment` or `create_comment`) with one ToolSearch, under the prefix the session's list of available tools shows (`mcp__claude_ai_Linear__` or `mcp__linear__`); don't guess it. If the Linear tools are not available, stop and say so. Read the comments with `list_comments`.
   - **`github`**: the issue's ID is `#<number>`. Read its comments with `gh issue view <number> --repo <repo> --json comments`.
2. **Check it can start.** The issue's `blockedBy` lists the unfinished issues that block it. If it lists any, or the issue waits on content or a decision only the person can provide, stop and ask.
3. **Name the session's Herdr tab after the issue**, so the Herdr agents list tells issue sessions apart. Do this in every session, including one that starts in the issue's worktree. Skip it without comment only when `$HC_TERMINAL_ID` is empty or `herdr-app` isn't installed. Summarize the issue's title in as few words as possible, one to three, and run `issues tab rename <issue ID> "<summary>"`. It renames only a tab nobody named (`Claude` or a number), so a name the person chose stays, and prefixes the issue ID when the tab's space isn't named after the issue (for example `#33 Tab names`).
4. **Get on the issue's branch.** In a linked worktree the session started in, that is the current branch, and the batch above already read its pull request. Elsewhere, `/issues:start` opened the issue's worktree when the Herdr app is installed; without it, follow `without-herdr.md`.
   - When the repository's guide (its `AGENTS.md` or `CLAUDE.md`) says how to prepare a new worktree, such as installing dependencies, do that before running its tests or the app, skipping what the repository's `worktreeSetup` command in `issues.json`, which `issues worktree` runs in each new worktree, already did.
5. **Catch up on work already done.** An issue that is already in progress may have commits, a pull request and review from an earlier session, another computer or a cloud agent. The person may only want to ask questions about it, so start light:
   - Read the issue's comments, what the branch already does, and its pull request's state, review decision and checks, all from the batch above.
   - Summarize where the issue stands in a few sentences and suggest the next action. If the person asked to continue the issue, go straight on to that action; otherwise stop to wait for them. People often continue an issue to review or extend the existing work, so the summary covers the pull request when there is one.
   - Don't redo what's done or start a second branch.
6. **Mark it in progress.** Herdr's Start may already have done this, so check first: when the issue isn't in progress yet, run `issues start <issue ID>`, which moves it to in progress through its tracker, assigns the person where nobody is (Linear and GitHub, where in progress means open and assigned), and refreshes the Herdr issues panel.
7. **Do the work.** Read the code named in Context, then meet each acceptance criterion, following the repository's guide for writing code and committing (its `AGENTS.md` or `CLAUDE.md`, or a guide one names) and the person's own instructions. When the repository has a test suite, cover the change with tests. Work independently through to step 10: don't stop for approval of commits or a pull request's description. Stay inside the issue's scope; record anything found out of scope in an issue comment instead of doing it.
8. **Keep the issue current as you go.** Record findings and decisions a later reader would need as issue comments: a Linear comment, or `gh issue comment` for GitHub, with the comment written to a file in the scratchpad.
   - **Check off the criteria** in the body once, in step 10, on every tracker: read the issue again with `issues show <id> --json`, write its `body` with the criteria checked to a file in the scratchpad, and save it with `issues edit <id> --body-file <file> --body-hash <bodyHash>`, passing the `bodyHash` that same read printed. It refuses, changing nothing, when the body changed since that read; then read it again and check the criteria off in the new body.
9. **Verify.** Run every step in **Verification**. When the issue has no Verification section, run the tests that cover the changed code and the repository's linters on the changed files instead. The issue is finished only when every criterion is checked and every verification step passes; report any failure with its output.
10. **Finish.** An issue is one branch and one merge, so it is done exactly when its branch lands in main. First commit any uncommitted work, following the repository's commit conventions. Also make the one body edit that checks off the criteria. A criterion only the person can check by hand, such as playing it in the running program, doesn't hold the issue open: leave it unchecked and say in an issue comment that it wasn't run. Then run `issues setting merge`, which prints how the repository's branches land in main, and follow it:
   - **`auto`**: merge the branch into main locally in the main checkout, run **Verification** again on main when it's needed, then mark the issue done at once, as below.
   - **Verification** needs running again on main only when main's tree differs from the verified branch's: when `git diff --quiet HEAD main` succeeds in the worktree, main holds exactly what was just verified, so skip it.
   - **`review`**: follow `merge-review.md`.
   - **`pull-request`**: follow `merge-pull-request.md`.
   - Mark an issue done with `issues status <issue ID> done`, which moves a Linear issue to Done, closes a GitHub issue as completed and closes a Beads issue, and refreshes the Herdr issues panel.
   - If the work turns out wrong or unnecessary, cancel the issue instead and say why in an issue comment: `issues status <issue ID> canceled`, which closes a GitHub issue as not planned.
11. **Confirm the worktree can close.** Never remove a Herdr worktree yourself. Run `issues setting complete`, which prints when the repository's work counts as complete. The work is complete when either:
   - nothing in the worktree is uncommitted (`git status --porcelain` is empty), and:
     - with `merged`, the branch is merged into main (`git merge-base --is-ancestor HEAD main`);
     - with `pull-request-open`, the branch is merged into main, or is pushed with no unpushed commits and has an open pull request (`gh pr view --json state,url`) whose checks pass or whose failures are recorded in an issue comment as not caused by the branch; or
   - the person explicitly canceled the work.

   If so, end your final message with this block, set apart from everything above it, filling in the issue ID, the reason, and the merge or PR result, and write nothing after it:

   ```
   ---

   ## ✅ Session finished: <issue ID>

   <one sentence: merged into main, or, with `pull-request-open`, PR open at <url>; nothing is uncommitted>

   **This session is finished. Close this worktree with cmd+shift+w.**
   ```

   Do not ask follow-up questions or offer further work in that message, so it reads clearly as the end of the session. Otherwise, list what's outstanding and keep the worktree. With `merged` and a pull request that is still open, end by saying the worktree stays until the pull request merges, and leave the issue in review; continuing the issue once it has merged finishes it in step 10.
