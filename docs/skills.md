# Claude skills

**The Claude plugin** adds the `issues:*` skills, which create, plan, triage and work issues in whichever tracker the repository uses.

Run these in a Claude Code session in the repository, for example `/issues:work #12`. Each works with the repository's tracker.

| Skill | Use it to |
| --- | --- |
| `/issues:config` | Choose where a repository's issues are tracked (a Linear team, GitHub Issues or a local Beads database) and check the credentials that tracker needs, or show and change its other settings: how its work is approved and reaches main, whether finished sessions close their worktrees, its space's name, the command run in each new worktree, and the model and effort of the sessions that work issues. |
| `/issues:create` | Write issues for work that is already settled, as self-contained hand-offs. |
| `/issues:plan` | Turn a prompt, a brief or a full spec into a series of issues by interviewing you. |
| `/issues:triage` | Triage issues, the backlog or Linear's triage queue, making each one small and actionable enough to hand to an agent. |
| `/issues:start` | Start one or more issues, or the next few, each in its own worktree space with a Claude session working it. |
| `/issues:work` | Work an issue from start to finish in the current session. |
