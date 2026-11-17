---
name: work
description: Work an issue from start to finish, whether it lives in Linear, in GitHub Issues or in a local Beads database. Use when asked to work on, pick up, continue or finish an issue, ticket or task, or given an issue ID or Linear URL to work, for example "work on <issue ID>", "work on <issue URL>", "pick up <issue ID>" or "continue <issue ID>". To start issues in their own worktree spaces, use /issues:start.
argument-hint: <issue ID or Linear URL>
---

Work the issue named in `$ARGUMENTS` or the conversation until it is done, or until it needs a decision only the person can make.

**The `issues` CLI.** When `command -v issues` fails, tell the person to run `./setup` from the herdr-issues repository, and stop.

**Outside the issue's worktree.** When the Herdr app is installed (`command -v herdr-app`) and the session isn't already in a linked worktree on the issue's branch, invoke `/issues:start <issue ID>` with the Skill tool as your first action, without loading the tracker's tools or reading the issue first, and stop once it reports.

**Read only the parts that apply.** Read a file in this skill's base directory only when its case comes up:

- `beads.md` when the tracker is `beads` (IDs like `notes-a1b`); it replaces the Beads parts of every step below;
- `without-herdr.md` in step 4 when the Herdr app isn't installed;
- `approval.md` in step 10 when `issues setting approval` prints `ask`;
- `merge-pull-request.md` in step 10 when `issues setting onApproval` prints `pull-request`, and in step 5 when the branch already has a pull request with review or failing checks.

**Gather context in one batch.** When the session starts in a linked worktree (its folder isn't the first path `git worktree list` prints), make every read steps 1 to 5 need in your first response, as parallel tool calls:

- the issue: `issues show <id> --json`, and its comments: `list_comments` (Linear) or `gh issue view <number> --repo <repo> --json comments` (GitHub);
- one shell command for the branch: `git worktree list | head -1`, `git log --oneline origin/main..HEAD`, `git diff --stat origin/main...HEAD`, and `git status --porcelain` unless the worktree's folder is under five minutes old (`[ -n "$(find . -maxdepth 0 -mmin -5)" ]`);
- for a Linear issue, the current branch's pull request: `gh pr view --json number,state,url,isDraft,reviewDecision,headRefName` and `gh pr checks`, which fail harmlessly when it has none.

Then name the session's tab as step 3 says, and summarize as step 5 says. Read the full diff, review comments or the code only once the summary or the person's direction needs them.

1. **Find the issue** in the tracker `issues tracker --json` prints. If it fails, show what it printed and stop. Read the issue with `issues show <issue ID> --json`; if it prints `<issue ID>: not found`, stop and say so.
   - **`linear`**: Load `list_comments` and the comment tool (`save_comment` or `create_comment`) with one ToolSearch, under the prefix the session's list of available tools shows (`mcp__claude_ai_Linear__` or `mcp__linear__`); don't guess it. If the Linear tools are not available, stop and say so. Read the comments with `list_comments`.
   - **`github`**: the issue's ID is `#<number>`. Read its comments with `gh issue view <number> --repo <repo> --json comments`.
2. **Check it can start.** If `blockedBy` lists any issue, or the issue waits on content or a decision only the person can provide, stop and ask.
3. **Name the session's Herdr tab after the issue**, in every session. Summarize the issue's title in one to three words and run `issues tab rename <issue ID> "<summary>"`, then `issues mark working <issue ID>`.
4. **Get on the issue's branch.** In a linked worktree the session started in, that is the current branch. Run commands with paths relative to the worktree and never `cd` to its absolute path; only a command that must run in the main checkout, such as `bd -C <main checkout>`, names that checkout. Without the Herdr app, follow `without-herdr.md`.
   - When the repository's guide (its `AGENTS.md` or `CLAUDE.md`) says how to prepare a new worktree, do that before running its tests or the app, skipping what the repository's `worktreeSetup` command in `issues.json` already did.
5. **Catch up on work already done.** The branch may have commits, a pull request and review from an earlier session, so start light:
   - Read the issue's comments, what the branch already does, and its pull request's state, review decision and checks, all from the batch above.
   - Summarize where the issue stands in a few sentences, covering the pull request when there is one, and suggest the next action. If the person asked to continue the issue, go straight on to that action; otherwise stop to wait for them.
   - Don't redo what's done or start a second branch.
6. **Mark it in progress.** When the issue's `status` isn't in progress yet, run `issues start <issue ID>`.
7. **Do the work.** Read the code named in Context, then meet each acceptance criterion, following the repository's guide for writing code and committing (its `AGENTS.md` or `CLAUDE.md`, or a guide one names) and the person's own instructions. When the repository has a test suite, cover the change with tests. Work independently through to step 10: don't stop for approval of commits or a pull request's description. Stay inside the issue's scope; record anything found out of scope in an issue comment instead of doing it.
8. **Keep the issue current as you go.** Record findings and decisions a later reader would need as issue comments: a Linear comment, or for GitHub `gh issue comment <number> --body-file - <<'EOF'`, with the comment in the quoted heredoc rather than a scratchpad file.
   - **Check off the criteria** once, in step 10, with `issues check <id>`, adding `--except <n>` for each criterion left unchecked, where `<n>` counts the body's unchecked items from 1 in order; don't edit the body by hand to check items.
9. **Verify.** Run every step in **Verification**, or, when the issue has none, the tests that cover the changed code and the repository's linters on the changed files. The issue is finished only when every criterion is checked and every verification step passes; report any failure with its output.
10. **Finish.** The issue is done exactly when its branch is merged into main. Commit any uncommitted work, following the repository's commit conventions, and check off the criteria with one `issues check <issue ID>`. Don't run the checks a **Checks for the person** section lists; they don't hold the issue open or need an issue comment. When an older issue lists such a check as a criterion, such as playing it in the running program, leave it unchecked with `--except <n>` and say in an issue comment that it wasn't run. Then run `issues setting approval` (`ask` or `auto`) and `issues setting onApproval` (`merge` or `pull-request`), and finish in this order:
    - **Review.** With `pull-request`, first run step 1 of `merge-pull-request.md`.
    - **Approval.** With `ask`, follow `approval.md`. With `auto`, go straight on.
    - **Merge it.** With `merge`, run `issues merge <issue ID>` from the worktree. If it refuses, say why and resolve it. When main hasn't moved on, it marks the issue done and pushes main with `pushAfterMerge`, so don't run `issues status <issue ID> done` after it. When it prints that main needs verifying instead, the issue stays open and main unpushed: run **Verification** on main in the main checkout, and once it passes, finish with `issues merge --verified <issue ID>`, which marks the issue done and pushes main with `pushAfterMerge`; if it fails, keep the issue open and tell the person what failed. With `pull-request`, follow `merge-pull-request.md` from step 2.
    - Only when the branch is merged without `issues merge` or the issue view's Merge button, such as a pull request merged on GitHub, run `issues status <issue ID> done`.
    - If the work turns out wrong or unnecessary, run `issues status <issue ID> canceled` instead and say why in an issue comment.
    - **A decision instead of code for main.** When the issue's outcome is a recorded decision or finding, such as a prototype whose branch is deliberately not merged, first write the issue comment that records it. There is no merge or pull request to review, so the person's approval finishes it, even when `issues setting approval` prints `auto`: run `issues complete <issue ID>` and `issues mark waiting <issue ID>`, then ask with the same two-option AskUserQuestion call as `approval.md` step 3, with the decision's summary and the sentence "Approving marks the issue done and the branch isn't merged." in the approving option's `preview`; "Not yet" works as `approval.md` step 7 says. Once they approve, run `issues status <issue ID> done`, leave the waiting mark in place and go to step 11 with `--discarded`.
11. **Hand off, and confirm the worktree can close.** Never remove a Herdr worktree yourself. First write any issue comment a later reader needs that the commits don't show, such as criteria left unchecked, a merge conflict resolved or a deviation from the issue; otherwise write none. Then run `issues finish <issue ID>`, adding `--canceled` when the person explicitly canceled the work, `--discarded` for a decision issue whose branch isn't merged, and `--checks-recorded` once an issue comment records that the pull request's failing checks weren't caused by the branch.
    - When it exits 1 listing what's outstanding, resolve what you can and run it again; otherwise tell the person what's outstanding and keep the worktree.
    - When it succeeds, follow what it prints exactly: when it says the final message is only the block, write nothing above it; otherwise a summary may come before the block. Write nothing after the block except the question it prints, asked with AskUserQuestion, and the reply to its answer.

    Apart from that question, do not ask follow-up questions or offer further work in the final message.

12. **Reopen a finished session for more changes.** When the person asks for changes after `issues complete` ran in this session, including while it waits for their approval, first run `issues complete --cancel <issue ID>` and `issues mark working <issue ID>`, and `issues close --cancel <issue ID>` too if this session ran `issues close` or `issues finish`. Then read the issue with `issues show <issue ID> --json`, and when its `status` isn't `in-progress`, run `issues status <issue ID> in-progress`. Work the change, then finish through steps 10 and 11 again. A question or thanks isn't a change request and reopens nothing.
