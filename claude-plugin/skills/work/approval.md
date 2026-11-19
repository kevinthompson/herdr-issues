# Asking for approval with `approval: ask`

Read this beside `SKILL.md` when `issues setting approval` prints `ask`: the person approves the change in this session before the branch is merged or its pull request opened.

1. Once **Verification** passes, and with `onApproval: pull-request` the review in step 1 of `merge-pull-request.md` is done, move a Linear issue to in review with `issues status <issue ID> in-review`. A GitHub issue keeps its status; a Beads issue stays `in_progress`.
2. **Check the merge first,** with `onApproval: merge`: run `issues merge --check <issue ID>` from the worktree.
   - It exits 0: go on to step 3.
   - It refuses because the branch doesn't merge cleanly into main: merge main into the branch in the worktree (`git merge main`), resolve the conflicts, commit the merge, run **Verification** again and check again.
   - It refuses for something outside the branch, such as uncommitted changes in the main checkout or the main checkout on another branch: ask anyway, and start the approving option's `description` with what must be fixed before approving will merge, for example "Fix first: commit or stash main's changes.", so it shows beside the consequence and is never cut off.
3. Stop and ask for approval. First run `issues complete <issue ID>` and `issues mark waiting <issue ID>`. Then write the details in your response text, before the dialog:
   - what each commit does, including its body's reasoning, and the review's results and any follow-ups found out of scope;
   - with `onApproval: merge`, that they can approve it themselves with the Merge button in the issue's view in the Herdr issues panel, or by running `issues merge <issue ID>`; either merges the branch into main, and once main is verified, which this session does when main moved on, marks the issue done and pushes main when `issues setting pushAfterMerge` prints `true`.

   Then ask with one AskUserQuestion call. A terminal can show the dialog without your response text, and a `preview` gets only about half its width, cutting off what doesn't fit, so the dialog carries only what the person needs to decide:
   - a one-line question naming the issue, for example "Approve #12's branch?";
   - a first option that approves, labeled "Approve", whose `description` is the short sentence from step 4 that says what approving will do, and whose `preview` is a summary of at most about 12 narrow lines: each commit's subject on its own line, without its body, then the changed files from `git diff --compact-summary main...HEAD`, or `git diff --stat=40 main...HEAD` when that is shorter. Add nothing else to the preview, such as follow-ups, review notes or the Merge button, since those belong in the response text;
   - a second option that declines for now, labeled "Not yet".

4. **What approving will do.** Read `issues setting onApproval`, `issues setting waitForChecks`, `issues setting pushAfterMerge` and `issues setting close`, and use this sentence word for word as the approving option's `description`, after anything step 2 says to fix.

   | `onApproval`   | `waitForChecks` | `pushAfterMerge` | `close` | Sentence                                                                                                |
   | -------------- | --------------- | ---------------- | ------- | ------------------------------------------------------------------------------------------------------- |
   | `merge`        | any             | `false`          | `auto`  | Merges into main and closes the worktree.                                                               |
   | `merge`        | any             | `false`          | `ask`   | Merges into main, then asks whether to close the worktree.                                              |
   | `merge`        | any             | `true`           | `auto`  | Merges into main, pushes main once it's verified and closes the worktree.                               |
   | `merge`        | any             | `true`           | `ask`   | Merges into main, pushes main once it's verified, then asks whether to close the worktree.              |
   | `pull-request` | `false`         | any              | `auto`  | Pushes the branch, opens a pull request and closes the worktree.                                        |
   | `pull-request` | `false`         | any              | `ask`   | Pushes the branch, opens a pull request, then asks whether to close the worktree.                       |
   | `pull-request` | `true`          | any              | `auto`  | Pushes the branch, opens a pull request, waits for its checks and closes the worktree.                  |
   | `pull-request` | `true`          | any              | `ask`   | Pushes the branch, opens a pull request, waits for its checks, then asks whether to close the worktree. |

5. When the session finds its branch already merged into main (`git merge-base --is-ancestor HEAD main`), the person approved it that way: don't merge again, but continue from the merged state. When the issue isn't done yet, main needs verifying: run **Verification** on main as `SKILL.md` step 10 says, and once it passes, finish with `issues merge --verified <issue ID>`.
6. Once they approve in the session, leave the space's waiting mark in place while you finish, and finish as `SKILL.md` step 10 says. When `issues merge` still refuses, because main moved on while the session waited or what step 2 said to fix wasn't fixed, first withdraw the mark as `SKILL.md` step 12 says, then make the branch mergeable as step 2 does and ask again from step 3.
7. When they answer "Not yet", don't merge or open a pull request: leave the issue marked waiting and complete, say they can ask for changes or approve it later in this session, and stop.
8. If they ask for changes instead, by typing them as the dialog's Other answer or in a later message, first withdraw the mark as `SKILL.md` step 12 says, then make them, commit them, run **Verification** again, and ask again from step 2 with a fresh summary.
