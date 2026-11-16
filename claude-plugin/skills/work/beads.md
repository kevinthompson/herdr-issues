# Working a Beads issue

Read this beside `SKILL.md` when the tracker is `beads`. A Beads ID looks like `<prefix>-<hash>`, such as `notes-a1b`.

- **Where it lives**: the Beads database in the main checkout's `.beads/` folder, the first path `git worktree list` prints. A worktree has no `.beads/`, so run every `bd` command there with `bd -C <main checkout>`. Beads keeps its database out of git, so no Beads change makes a commit.
- **Before anything else**: run `issues auth beads`; if it fails, relay the problem and fix it prints, tell the person to run `/issues:config`, and stop.
- **Comments**: read them with `bd -C <main checkout> comments <id> --json`; in the first batch, `issues auth beads && bd -C "$(git worktree list --porcelain | sed -n '1s/^worktree //p')" comments <id> --json`. Post one with `bd -C <main checkout> comment <id> --stdin <<'EOF'`, the comment on standard input in the quoted heredoc rather than in a scratchpad file.
- **Pull request**: like a Linear issue, read the current branch's pull request in the first batch with `gh pr view --json number,state,url,isDraft,reviewDecision,headRefName` and `gh pr checks`, which fail harmlessly when it has none.
- **Review**: Beads has no review status, so an issue waiting on review or on its pull request stays `in_progress`.
- **Done**: `issues status <issue ID> done` closes it. Nothing closes a Beads issue for you, since Beads doesn't see pull requests, so mark it done yourself once its branch is merged into main.
- **Canceling**: Beads has no canceled status; close it with a reason, `bd -C <main checkout> close <id> --reason "<why>"`.
