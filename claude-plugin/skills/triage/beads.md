# Triaging Beads issues

Read this beside `SKILL.md` when the tracker is `beads`; it replaces the Beads parts of every step there.

- **Where it lives**: use the `bd` CLI in the main checkout, the first path `git worktree list` prints, with `bd -C <main checkout>`, since the database lives in its `.beads/` folder and a worktree has none. Beads keeps its database out of git, so triage makes no commit.
- **Before anything else**: run `issues auth beads`; if it fails, relay the problem and fix it prints, tell the person to run `/issues:config`, and stop.
- **Reading**: list issues with `bd -C <main checkout> list --json --limit 0 --status <statuses>`, read an issue's comments with `bd -C <main checkout> comments <id> --json` and the issues it blocks with `bd -C <main checkout> dep list <id> --direction up -t blocks --json`.
- **Comments**: post one with `bd -C <main checkout> comment <id> --stdin <<'EOF'`, the comment on standard input in the quoted heredoc rather than in a scratchpad file.
- **Blockers** are `blocks` dependencies: an issue's `dependencies` whose `dependency_type` is `blocks` are its blockers, and its `dependents` of that type are the issues it blocks. Add one with `bd -C <main checkout> dep add <blocked ID> <blocker ID>` and remove one with `bd -C <main checkout> dep remove <blocked ID> <blocker ID>`. Replace any "Blocked by" line in the body with the dependency.
- **Priority and status**: Beads has priorities and a backlog, so step 7 asks both questions, mapped as the issues panel maps them: Urgent, High, Medium, Low and None are P0 to P4, and Todo and Backlog are the statuses `open` and `deferred`. Leave an issue that is `in_progress` or `blocked` in its status unless the person asks to move it. Save a changed priority with `bd -C <main checkout> update <id> --priority <P0–P4>`.
- **Canceling**: Beads has no canceled status; close the issue with a reason, `bd -C <main checkout> close <id> --reason "<why>"`, and record why in a comment.
