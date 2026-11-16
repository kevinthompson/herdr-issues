# Asking for approval with `approval: ask`

Read this beside `SKILL.md` when `issues setting approval` prints `ask`: the person approves the change in this session before the branch is merged or its pull request opened.

1. Once **Verification** passes, and with `onApproval: pull-request` the review in step 1 of `merge-pull-request.md` is done, move a Linear issue to in review with `issues status <issue ID> in-review`. A GitHub issue keeps its status; a Beads issue stays `in_progress`.
2. **Check the merge first,** with `onApproval: merge`: run `issues merge --check <issue ID>` from the worktree.
   - It exits 0: go on to step 3.
   - It refuses because the branch doesn't merge cleanly into main: merge main into the branch in the worktree (`git merge main`), resolve the conflicts, commit the merge, run **Verification** again and check again.
   - It refuses for something outside the branch, such as uncommitted changes in the main checkout or the main checkout on another branch: ask anyway, and say in the preview what must be fixed before approving will merge.
3. Stop and ask for approval. First run `issues complete <issue ID>` and `issues mark waiting <issue ID>`. Then ask with one AskUserQuestion call, since a terminal can show the dialog without your response text:
   - a one-line question naming the issue, for example "Approve #12's branch?";
   - a first option that approves, labeled "Approve", whose `preview` holds the change's summary: `git diff --stat main...HEAD` and what each commit on the branch does. With `onApproval: merge`, the preview also says they can approve it themselves with the Merge button in the issue's view in the Herdr issues panel, or by running `issues merge <issue ID>`; either merges the branch into main and marks the issue done, and pushes main when `issues setting pushAfterMerge` prints `true`. The preview ends with the sentence below that says what approving will do;
   - a second option that declines for now, labeled "Not yet".
4. **What approving will do.** Read `issues setting onApproval`, `issues setting waitForChecks`, `issues setting pushAfterMerge` and `issues setting close`, and use this sentence word for word as the approving option's preview's last sentence.

   | `onApproval`   | `waitForChecks` | `pushAfterMerge` | `close` | Sentence                                                                                                                                |
   | -------------- | --------------- | ---------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------- |
   | `merge`        | any             | `false`          | `auto`  | Approving this work will merge this branch into main and close the worktree.                                                            |
   | `merge`        | any             | `false`          | `ask`   | Approving this work will merge this branch into main and then ask whether to close the worktree.                                        |
   | `merge`        | any             | `true`           | `auto`  | Approving this work will merge this branch into main, push main and close the worktree.                                                 |
   | `merge`        | any             | `true`           | `ask`   | Approving this work will merge this branch into main, push main and then ask whether to close the worktree.                             |
   | `pull-request` | `false`         | any              | `auto`  | Approving this work will push this branch, open a pull request and close the worktree.                                                  |
   | `pull-request` | `false`         | any              | `ask`   | Approving this work will push this branch, open a pull request and then ask whether to close the worktree.                              |
   | `pull-request` | `true`          | any              | `auto`  | Approving this work will push this branch, open a pull request, wait for its checks to pass and close the worktree.                     |
   | `pull-request` | `true`          | any              | `ask`   | Approving this work will push this branch, open a pull request, wait for its checks to pass and then ask whether to close the worktree. |

5. When the session finds its branch already merged into main (`git merge-base --is-ancestor HEAD main`), the person approved it that way: don't merge again, but continue from the merged state, running **Verification** on main only when `SKILL.md` step 10 says it's needed, and marking the issue done if it isn't yet.
6. Once they approve in the session, leave the space's waiting mark in place while you finish, and finish as `SKILL.md` step 10 says. When `issues merge` still refuses, because main moved on while the session waited or what step 2 said to fix wasn't fixed, first withdraw the mark as `SKILL.md` step 12 says, then make the branch mergeable as step 2 does and ask again from step 3.
7. When they answer "Not yet", don't merge or open a pull request: leave the issue marked waiting and complete, say they can ask for changes or approve it later in this session, and stop.
8. If they ask for changes instead, by typing them as the dialog's Other answer or in a later message, first withdraw the mark as `SKILL.md` step 12 says, then make them, commit them, run **Verification** again, and ask again from step 2 with a fresh summary.
