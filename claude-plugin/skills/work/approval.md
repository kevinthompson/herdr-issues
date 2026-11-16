# Asking for approval with `approval: ask`

Read this beside `SKILL.md` when `issues setting approval` prints `ask`: the person approves the change in this session before the branch merges into main with `onApproval: merge`, or before it's pushed and its pull request opens with `onApproval: pull-request`.

1. Once **Verification** passes, and with `onApproval: pull-request` the review in step 1 of `merge-pull-request.md` is done, move a Linear issue to in review with `issues status <issue ID> in-review`. A GitHub issue keeps its status, since it shows as in review only while a pull request links it; a Beads issue stays `in_progress`.
2. **Check the merge first,** with `onApproval: merge`, so approving merges straight away: run `issues merge --check <issue ID>` from the worktree. It makes every check `issues merge` makes, including a trial merge, and changes nothing.
   - It exits 0: go on to step 3.
   - It refuses because the branch doesn't merge cleanly into main: merge main into the branch in the worktree (`git merge main`), resolve the conflicts, commit the merge, run **Verification** again and check again.
   - It refuses for something outside the branch, such as uncommitted changes in the main checkout or the main checkout on another branch: ask anyway, and say in the message what must be fixed before approving will merge.
3. Stop and ask for approval. The session is done working until the person answers, so first run `issues complete <issue ID>` and `issues mark waiting <issue ID>` to mark its Herdr space as waiting on the person. Then summarize the change with `git diff --stat main...HEAD` and what each commit on the branch does. With `onApproval: merge`, say they can also approve it themselves with the Merge button in the issue's view in the Herdr issues panel, or by running `issues merge <issue ID>`; either merges the branch into main and marks the issue done. End the message, just before the question, with the sentence below that says what approving will do.
4. **What approving will do.** Read `issues setting onApproval`, `issues setting waitForChecks` and `issues setting close`, and use this sentence word for word as the message's last sentence before the question. `waitForChecks` applies only with `pull-request`.

   | `onApproval` | `waitForChecks` | `close` | Sentence |
   | --- | --- | --- | --- |
   | `merge` | any | `auto` | Approving this work will merge this branch into main and close the worktree. |
   | `merge` | any | `ask` | Approving this work will merge this branch into main and then ask whether to close the worktree. |
   | `pull-request` | `false` | `auto` | Approving this work will push this branch, open a pull request and close the worktree. |
   | `pull-request` | `false` | `ask` | Approving this work will push this branch, open a pull request and then ask whether to close the worktree. |
   | `pull-request` | `true` | `auto` | Approving this work will push this branch, open a pull request, wait for its checks to pass and close the worktree. |
   | `pull-request` | `true` | `ask` | Approving this work will push this branch, open a pull request, wait for its checks to pass and then ask whether to close the worktree. |

5. When the session finds its branch already merged into main (`git merge-base --is-ancestor HEAD main`), the person approved it that way: don't merge again, but continue from the merged state, running **Verification** on main only when `SKILL.md` step 10 says it's needed, and marking the issue done if it isn't yet.
6. Once they approve in the session, leave the space's waiting mark in place while you finish, and finish as `SKILL.md` step 10 says. When `issues merge` still refuses, because main moved on while the session waited or what step 2 said to fix wasn't fixed, first withdraw the mark as `SKILL.md` step 12 says, then make the branch mergeable as step 2 does and ask again from step 3.
7. If they ask for changes instead, first withdraw the mark as `SKILL.md` step 12 says, then make them, commit them, run **Verification** again, and ask again from step 2 with a fresh summary.
