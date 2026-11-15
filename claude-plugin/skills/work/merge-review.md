# Finishing with `merge: review`

Read this beside `SKILL.md` when `issues setting merge` prints `review`: the person reviews the change in this session before it merges.

1. Once **Verification** passes, move a Linear issue to in review with `issues status <issue ID> in-review`. A GitHub issue keeps its status, since it shows as in review only while a pull request links it; a Beads issue stays `in_progress`.
2. Stop and ask for approval: summarize the change with `git diff --stat main...HEAD` and what each commit on the branch does, and ask the person to approve the merge. Say they can also approve it themselves with the Merge button in the issue's view in the Herdr issues panel, or by running `issues merge <issue ID>`; either merges the branch into main and marks the issue done.
3. When the session finds its branch already merged into main (`git merge-base --is-ancestor HEAD main`), the person approved it that way: don't merge again, but continue from the merged state, running **Verification** on main and marking the issue done if it isn't yet.
4. Once they approve in the session, finish as `auto` does: merge locally in the main checkout, run **Verification** again on main, and mark the issue done.
5. If they ask for changes instead, make them, commit them, run **Verification** again, and ask again with a fresh summary.
